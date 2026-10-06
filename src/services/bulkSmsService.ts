import { prisma } from "../lib/prisma.js";
import { normalizeMobile } from "./clientLicenseService.js";
import {
  sendBulkSms,
  type BulkSmsItem,
  type BulkSmsResponseItem,
} from "./smsService.js";
import { createLog } from "./systemLogService.js";

/** Advanta accepts at most 20 messages per sendbulk call. */
const ADVANTA_BULK_BATCH_SIZE = 20;

/** Placeholder replaced with each recipient's name, e.g. "Dear {name}, Merry Christmas!" */
export const NAME_PLACEHOLDER = "{name}";

export type BroadcastRecipientType = "CLIENT" | "EMPLOYEE";

export type BroadcastInput = {
  message: string;
  clientIds: string[];
  employeeIds: string[];
  performedBy?: string | undefined;
};

export type BroadcastFailure = {
  type: BroadcastRecipientType;
  id: string;
  name: string;
  mobile: string | null;
  reason: string;
};

export type BroadcastResult = {
  requested: number;
  sent: number;
  failed: BroadcastFailure[];
  skipped: BroadcastFailure[];
};

type ResolvedRecipient = {
  type: BroadcastRecipientType;
  id: string;
  name: string;
  mobile: string;
};

/**
 * Lightweight lists of non-archived clients with a valid phone and active employees,
 * for the director bulk SMS page (not paginated, unlike /clients).
 */
export async function getRecipients() {
  const [clients, employees] = await Promise.all([
    prisma.client.findMany({
      where: { status: { not: "archived" } },
      select: {
        id: true,
        companyName: true,
        contactPerson: true,
        phone: true,
        alternatePhone: true,
        status: true,
      },
      orderBy: { companyName: "asc" },
    }),
    prisma.employee.findMany({
      where: { status: "active" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        position: true,
        role: { select: { name: true } },
      },
      orderBy: { firstName: "asc" },
    }),
  ]);

  return {
    // Only clients we can actually text are offered for selection.
    clients: clients
      .filter(
        (c) => !!normalizeMobile(c.phone) || !!normalizeMobile(c.alternatePhone)
      )
      .map((c) => ({ ...c, hasValidPhone: true })),
    employees: employees.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      phone: e.phone,
      position: e.position,
      roleName: e.role?.name ?? null,
      hasValidPhone: !!normalizeMobile(e.phone),
    })),
  };
}

function isAdvantaSuccess(res: BulkSmsResponseItem): boolean {
  const code = res["response-code"] ?? res["respose-code"];
  return Number(code) === 200;
}

function personalise(message: string, name: string): string {
  return message.split(NAME_PLACEHOLDER).join(name);
}

/**
 * Send one message to the selected clients and employees via Advanta bulk SMS.
 * Phone numbers are resolved server-side from IDs; a number shared by several
 * recipients only receives the message once.
 */
export async function sendBroadcast(
  input: BroadcastInput
): Promise<BroadcastResult> {
  const clientIds = [...new Set(input.clientIds)];
  const employeeIds = [...new Set(input.employeeIds)];

  const [clients, employees] = await Promise.all([
    clientIds.length
      ? prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: {
            id: true,
            companyName: true,
            contactPerson: true,
            phone: true,
            alternatePhone: true,
          },
        })
      : [],
    employeeIds.length
      ? prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, firstName: true, lastName: true, phone: true },
        })
      : [],
  ]);

  const skipped: BroadcastFailure[] = [];
  const recipients: ResolvedRecipient[] = [];
  const seenMobiles = new Set<string>();

  const addRecipient = (
    type: BroadcastRecipientType,
    id: string,
    name: string,
    mobile: string | null
  ) => {
    if (!mobile) {
      skipped.push({ type, id, name, mobile, reason: "No valid phone number" });
      return;
    }
    if (seenMobiles.has(mobile)) {
      skipped.push({
        type,
        id,
        name,
        mobile,
        reason: "Duplicate phone number (already receiving this message)",
      });
      return;
    }
    seenMobiles.add(mobile);
    recipients.push({ type, id, name, mobile });
  };

  for (const c of clients) {
    const name =
      (c.contactPerson && c.contactPerson.trim()) || c.companyName || "Customer";
    addRecipient(
      "CLIENT",
      c.id,
      name,
      normalizeMobile(c.phone) || normalizeMobile(c.alternatePhone)
    );
  }
  for (const e of employees) {
    addRecipient("EMPLOYEE", e.id, e.firstName, normalizeMobile(e.phone));
  }

  const failed: BroadcastFailure[] = [];
  let sent = 0;

  for (let i = 0; i < recipients.length; i += ADVANTA_BULK_BATCH_SIZE) {
    const batch = recipients.slice(i, i + ADVANTA_BULK_BATCH_SIZE);
    const smslist: BulkSmsItem[] = batch.map((r, idx) => ({
      mobile: r.mobile,
      message: personalise(input.message, r.name),
      clientsmsid: i + idx + 1,
    }));

    try {
      const result = await sendBulkSms({ smslist });
      const byClientSmsId = new Map(
        (result.responses ?? []).map((res) => [String(res.clientsmsid), res])
      );
      batch.forEach((r, idx) => {
        const res = byClientSmsId.get(String(i + idx + 1));
        if (res && isAdvantaSuccess(res)) {
          sent++;
        } else {
          failed.push({
            ...r,
            reason: res?.["response-description"] ?? "No response from SMS provider",
          });
        }
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "SMS send failed";
      batch.forEach((r) => failed.push({ ...r, reason }));
    }
  }

  const result: BroadcastResult = {
    requested: clientIds.length + employeeIds.length,
    sent,
    failed,
    skipped,
  };

  try {
    await createLog({
      action: "OTHER",
      entityType: "BulkSms",
      entityId: "broadcast",
      performedBy: input.performedBy,
      newData: {
        message: input.message,
        clientCount: clientIds.length,
        employeeCount: employeeIds.length,
        sent,
        failed: failed.length,
        skipped: skipped.length,
      },
    });
  } catch (err) {
    // Audit logging must not hide the send result from the director.
    console.error("Failed to write bulk SMS system log:", err);
  }

  return result;
}
