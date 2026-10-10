import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { normalizeMobile } from "./clientLicenseService.js";
import { sendSingleSms } from "./smsService.js";
import { createLog } from "./systemLogService.js";

const TIMEZONE = "Africa/Nairobi";
const DAY_MS = 24 * 60 * 60 * 1000;

/** How many weekends ahead (including the current one) are kept scheduled. */
const UPCOMING_WEEKENDS = 8;
/** How many past weekends the rota page shows. */
const PAST_WEEKENDS = 6;

/** Advisory lock key so two requests never generate the same weekends at once. */
const STANDBY_LOCK_KEY = 7243002;

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  position: true,
} as const;

type Person = Prisma.EmployeeGetPayload<{ select: typeof personSelect }>;

/** Some names are stored with stray spaces; keep SMS text tidy. */
function firstName(person: { firstName: string }): string {
  return person.firstName.trim();
}

/** First and last name, used when an SMS names someone other than the recipient. */
function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.trim()} ${person.lastName.trim()}`;
}

const weekendInclude = {
  employee: { select: personSelect },
  originalEmployee: { select: personSelect },
  changedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

// ---------------------------------------------------------------------------
// Dates: weekends are identified by their Saturday, as a Nairobi calendar date
// stored at UTC midnight (Postgres DATE).
// ---------------------------------------------------------------------------

function nairobiToday(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(
    now
  );
  return new Date(`${ymd}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Saturday of the weekend in progress (Sat/Sun), otherwise the coming Saturday.
 */
export function currentWeekendStart(now: Date = new Date()): Date {
  const today = nairobiToday(now);
  const day = today.getUTCDay(); // 0 = Sunday, 6 = Saturday
  if (day === 6) return today;
  if (day === 0) return addDays(today, -1);
  return addDays(today, 6 - day);
}

/** e.g. "Sat 10 - Sun 11 Oct" */
export function formatWeekend(weekendStart: Date): string {
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
  const sunday = addDays(weekendStart, 1);
  return `Sat ${fmt(weekendStart, { day: "numeric" })} - Sun ${fmt(sunday, {
    day: "numeric",
    month: "short",
  })}`;
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

async function getActiveRotation(tx: Tx | typeof prisma = prisma) {
  const members = await tx.standbyRotationMember.findMany({
    orderBy: { position: "asc" },
    include: { employee: { select: { ...personSelect, status: true } } },
  });
  return members.filter((m) => m.employee.status === "active");
}

/**
 * Make sure every weekend from the last known one up to UPCOMING_WEEKENDS ahead
 * has a standby person, continuing the rotation 1, 2, 3, 1, 2, 3...
 *
 * The rotation slot of an existing weekend is whose turn it originally was
 * (originalEmployeeId when a director changed it), so changes and swaps do not
 * shift who comes next.
 */
async function ensureWeekends(tx: Tx, now: Date = new Date()): Promise<void> {
  const rotation = await getActiveRotation(tx);
  if (rotation.length === 0) return;
  const slotOf = new Map(rotation.map((m, i) => [m.employeeId, i]));

  const current = currentWeekendStart(now);
  const lastWeekend = addDays(current, 7 * (UPCOMING_WEEKENDS - 1));

  const latestBefore = await tx.standbyWeekend.findFirst({
    where: { weekendStart: { lte: current } },
    orderBy: { weekendStart: "desc" },
  });
  const start = latestBefore?.weekendStart ?? current;

  const existing = await tx.standbyWeekend.findMany({
    where: { weekendStart: { gte: start, lte: lastWeekend } },
  });
  const byDate = new Map(
    existing.map((w) => [w.weekendStart.toISOString(), w])
  );

  let prevSlot: number | null = null;
  const nextSlot = (): number =>
    prevSlot === null ? 0 : (prevSlot + 1) % rotation.length;
  for (let d = start; d <= lastWeekend; d = addDays(d, 7)) {
    const row = byDate.get(d.toISOString());
    if (row) {
      // Someone no longer in the rotation still used up a turn.
      prevSlot =
        slotOf.get(row.originalEmployeeId ?? row.employeeId) ?? nextSlot();
      continue;
    }
    const slot = nextSlot();
    await tx.standbyWeekend.create({
      data: { weekendStart: d, employeeId: rotation[slot]!.employeeId },
    });
    prevSlot = slot;
  }
}

async function withLock<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${STANDBY_LOCK_KEY})`;
    return fn(tx);
  });
}

export async function getRota(now: Date = new Date()) {
  await withLock((tx) => ensureWeekends(tx, now));

  const current = currentWeekendStart(now);
  const [rotation, weekends, activeEmployees] = await Promise.all([
    getActiveRotation(),
    prisma.standbyWeekend.findMany({
      where: {
        weekendStart: {
          gte: addDays(current, -7 * PAST_WEEKENDS),
          lte: addDays(current, 7 * (UPCOMING_WEEKENDS - 1)),
        },
      },
      include: weekendInclude,
      orderBy: { weekendStart: "asc" },
    }),
    // For the director's rotation and change pickers
    prisma.employee.findMany({
      where: { status: "active" },
      select: { id: true, firstName: true, lastName: true, position: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  return {
    currentWeekendStart: current,
    rotation: rotation.map((m) => ({
      employeeId: m.employeeId,
      position: m.position,
      employee: m.employee,
    })),
    weekends,
    activeEmployees,
  };
}

/**
 * Replace the rotation order. Upcoming weekends that no director has changed
 * are rebuilt from the new order; the current weekend and changed weekends stay.
 */
export async function setRotation(
  employeeIds: string[],
  performedBy?: string,
  now: Date = new Date()
) {
  if (employeeIds.length === 0) {
    throw new Error("The rotation needs at least one person");
  }
  if (new Set(employeeIds).size !== employeeIds.length) {
    throw new Error("A person can only appear once in the rotation");
  }
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, status: "active" },
    select: { id: true },
  });
  if (employees.length !== employeeIds.length) {
    throw new Error("Every person in the rotation must be an active employee");
  }

  const current = currentWeekendStart(now);
  const before = await getActiveRotation();

  await withLock(async (tx) => {
    await tx.standbyRotationMember.deleteMany({});
    await tx.standbyRotationMember.createMany({
      data: employeeIds.map((employeeId, i) => ({
        employeeId,
        position: i + 1,
      })),
    });
    await tx.standbyWeekend.deleteMany({
      where: { weekendStart: { gt: current }, originalEmployeeId: null },
    });
    await ensureWeekends(tx, now);
  });

  await createLog({
    action: "UPDATE",
    entityType: "StandbyRotation",
    entityId: "rotation",
    ...(performedBy && { performedBy }),
    oldData: before.map((m) => m.employeeId),
    newData: employeeIds,
  });

  return getRota(now);
}

// ---------------------------------------------------------------------------
// Changes and swaps
// ---------------------------------------------------------------------------

async function getEditableWeekend(id: string, now: Date) {
  const weekend = await prisma.standbyWeekend.findUnique({
    where: { id },
    include: weekendInclude,
  });
  if (!weekend) throw new Error("Standby weekend not found");
  if (weekend.weekendStart < currentWeekendStart(now)) {
    throw new Error("Past weekends cannot be changed");
  }
  return weekend;
}

/** Fields that record a change; the original turn holder is kept. */
function changeFields(
  weekend: { employeeId: string; originalEmployeeId: string | null },
  newEmployeeId: string,
  reason: string | null,
  performedBy?: string
) {
  const original = weekend.originalEmployeeId ?? weekend.employeeId;
  const backToOriginal = newEmployeeId === original;
  return {
    employeeId: newEmployeeId,
    originalEmployeeId: backToOriginal ? null : original,
    changeReason: backToOriginal ? null : reason,
    changedById: performedBy ?? null,
    changedAt: new Date(),
  };
}

async function smsPeople(
  people: Person[],
  messageFor: (person: Person) => string
): Promise<{ sent: number; errors: string[] }> {
  let sent = 0;
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const person of people) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    const mobile = normalizeMobile(person.phone);
    if (!mobile) {
      errors.push(`${firstName(person)}: no valid phone number`);
      continue;
    }
    try {
      await sendSingleSms({ mobile, message: messageFor(person) });
      sent++;
    } catch (err) {
      errors.push(
        `${firstName(person)}: ${err instanceof Error ? err.message : "SMS failed"}`
      );
    }
  }
  return { sent, errors };
}

/** Standby SMS (weekly reminder and changes) go to every active employee. */
async function allActiveEmployees(): Promise<Person[]> {
  return prisma.employee.findMany({
    where: { status: "active" },
    select: personSelect,
  });
}

type NamedPerson = { id: string; firstName: string; lastName: string };

/** Change SMS text: for the new standby person, the person freed up, and everyone else. */
export function changeMessage(
  recipient: { id: string; firstName: string },
  newPerson: NamedPerson,
  oldPerson: NamedPerson,
  weekendStart: Date
): string {
  const when = formatWeekend(weekendStart);
  if (recipient.id === newPerson.id)
    return `Hi ${firstName(recipient)}, standby change: you are now on standby for the weekend of ${when}, covering for ${fullName(oldPerson)}.`;
  if (recipient.id === oldPerson.id)
    return `Hi ${firstName(recipient)}, standby change: ${fullName(newPerson)} will cover your standby for the weekend of ${when}. You are off that weekend.`;
  return `Hi ${firstName(recipient)}, standby change: ${fullName(newPerson)} (instead of ${fullName(oldPerson)}) is on standby for the weekend of ${when}.`;
}

/**
 * Give one weekend to someone else and SMS the rotation about the change.
 */
export async function changeWeekend(
  id: string,
  newEmployeeId: string,
  reason: string | undefined,
  performedBy?: string,
  now: Date = new Date()
) {
  const weekend = await getEditableWeekend(id, now);
  if (weekend.employeeId === newEmployeeId) {
    throw new Error(
      `${fullName(weekend.employee)} is already on standby that weekend`
    );
  }
  const newPerson = await prisma.employee.findFirst({
    where: { id: newEmployeeId, status: "active" },
    select: personSelect,
  });
  if (!newPerson) throw new Error("Choose an active employee");

  const updated = await prisma.standbyWeekend.update({
    where: { id },
    data: changeFields(weekend, newEmployeeId, reason?.trim() || null, performedBy),
    include: weekendInclude,
  });

  await createLog({
    action: "UPDATE",
    entityType: "StandbyWeekend",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: weekend,
    newData: updated,
  });

  const oldPerson = weekend.employee;
  const notification = await smsPeople(
    [newPerson, oldPerson, ...(await allActiveEmployees())],
    (p) => changeMessage(p, newPerson, oldPerson, weekend.weekendStart)
  );

  return { weekend: updated, notification };
}

/**
 * Exchange the standby people of two weekends (e.g. someone is excused and takes
 * the other person's turn instead) and SMS the rotation about it.
 */
export async function swapWeekends(
  id: string,
  otherId: string,
  reason: string | undefined,
  performedBy?: string,
  now: Date = new Date()
) {
  if (id === otherId) throw new Error("Choose a different weekend to swap with");
  const [a, b] = await Promise.all([
    getEditableWeekend(id, now),
    getEditableWeekend(otherId, now),
  ]);
  if (a.employeeId === b.employeeId) {
    throw new Error(
      `${fullName(a.employee)} is on standby both weekends; nothing to swap`
    );
  }

  const note = reason?.trim() || null;
  const [updatedA, updatedB] = await prisma.$transaction([
    prisma.standbyWeekend.update({
      where: { id: a.id },
      data: changeFields(a, b.employeeId, note, performedBy),
      include: weekendInclude,
    }),
    prisma.standbyWeekend.update({
      where: { id: b.id },
      data: changeFields(b, a.employeeId, note, performedBy),
      include: weekendInclude,
    }),
  ]);

  await createLog({
    action: "UPDATE",
    entityType: "StandbyWeekend",
    entityId: `${a.id},${b.id}`,
    ...(performedBy && { performedBy }),
    oldData: [a, b],
    newData: [updatedA, updatedB],
    metadata: { operation: "SWAP" },
  });

  const personA = a.employee; // moves to weekend B
  const personB = b.employee; // moves to weekend A
  const whenA = formatWeekend(a.weekendStart);
  const whenB = formatWeekend(b.weekendStart);
  const notification = await smsPeople(
    [personA, personB, ...(await allActiveEmployees())],
    (p) => {
      if (p.id === personA.id)
        return `Hi ${firstName(p)}, standby swap: you are now on standby ${whenB} instead of ${whenA}. ${fullName(personB)} covers ${whenA}.`;
      if (p.id === personB.id)
        return `Hi ${firstName(p)}, standby swap: you are now on standby ${whenA} instead of ${whenB}. ${fullName(personA)} covers ${whenB}.`;
      return `Hi ${firstName(p)}, standby swap: ${fullName(personB)} is on standby ${whenA} and ${fullName(personA)} on ${whenB}.`;
    }
  );

  return { weekends: [updatedA, updatedB], notification };
}

// ---------------------------------------------------------------------------
// Weekly reminder
// ---------------------------------------------------------------------------

/** Weekly reminder text: one version for the standby person, one for everyone else. */
export function reminderMessage(
  recipient: { id: string; firstName: string },
  standby: { id: string; firstName: string; lastName: string },
  weekendStart: Date
): string {
  const when = formatWeekend(weekendStart);
  return recipient.id === standby.id
    ? `Hi ${firstName(recipient)}, reminder: you are on standby this weekend (${when}). Thank you!`
    : `Hi ${firstName(recipient)}, reminder: ${fullName(standby)} is on standby this weekend (${when}).`;
}

/**
 * SMS this weekend's standby person and every other active employee.
 * The Saturday cron skips weekends already reminded; `force` resends.
 */
export async function sendWeekendReminder(
  options: { force?: boolean; performedBy?: string } = {},
  now: Date = new Date()
) {
  await withLock((tx) => ensureWeekends(tx, now));

  const weekend = await prisma.standbyWeekend.findUnique({
    where: { weekendStart: currentWeekendStart(now) },
    include: weekendInclude,
  });
  if (!weekend) {
    return { skipped: "No standby rota has been set up", sent: 0, errors: [] };
  }
  if (weekend.reminderSentAt && !options.force) {
    return {
      skipped: "Reminder already sent for this weekend",
      sent: 0,
      errors: [],
    };
  }

  const standby = weekend.employee;
  const when = formatWeekend(weekend.weekendStart);
  const { sent, errors } = await smsPeople(
    [standby, ...(await allActiveEmployees())],
    (p) => reminderMessage(p, standby, weekend.weekendStart)
  );

  if (sent > 0) {
    await prisma.standbyWeekend.update({
      where: { id: weekend.id },
      data: { reminderSentAt: new Date() },
    });
  }

  if (options.performedBy) {
    await createLog({
      action: "OTHER",
      entityType: "StandbyWeekend",
      entityId: weekend.id,
      performedBy: options.performedBy,
      metadata: { operation: "SEND_REMINDER", sent, errors },
    });
  }

  return { skipped: null, standby: fullName(standby), when, sent, errors };
}
