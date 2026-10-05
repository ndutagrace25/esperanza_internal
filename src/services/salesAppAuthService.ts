import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { sendEmail } from "../utils/email.js";
import { sendSingleSms } from "./smsService.js";
import { normalizeMobile } from "./clientLicenseService.js";

// Sales app login (the mobile app for sales people). Separate from employee
// login: its own token type, so a sales person token never works on the
// internal system's employee routes and vice versa.
//
// - Sign in with email + 4-digit PIN.
// - First time (no PIN yet) or forgotten PIN: a 6-digit temporary PIN is sent
//   by email and SMS; entering it gives a short-lived token to set a new PIN.
// - 5 wrong PINs lock sign-in for 15 minutes; a temporary PIN expires after
//   15 minutes or 5 wrong tries.

const TOKEN_TYPE = "sales_person";
const SETUP_TOKEN_TYPE = "sales_person_pin_setup";
const TOKEN_TTL = "30d";
const SETUP_TOKEN_TTL = "15m";

const TEMP_PIN_TTL_MS = 15 * 60 * 1000;
const TEMP_PIN_MAX_ATTEMPTS = 5;
const TEMP_PIN_RESEND_AFTER_MS = 60 * 1000;
const PIN_MAX_FAILURES = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

export class SalesAppAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

const PIN_RE = /^\d{4}$/;

const normalizeEmail = (email: unknown) => String(email ?? "").trim().toLowerCase();

const maskEmail = (email: string) => {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
};

const maskPhone = (phone: string) =>
  phone.length > 6 ? `${phone.slice(0, 4)}${"*".repeat(phone.length - 7)}${phone.slice(-3)}` : phone;

export type SalesPersonProfile = { id: string; name: string; email: string | null; phone: string | null };

const toProfile = (p: { id: string; name: string; email: string | null; phone: string | null }) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  phone: p.phone,
});

/** Active sales person by email (case-insensitive). */
async function findActiveByEmail(emailInput: unknown) {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    throw new SalesAppAuthError("Enter a valid email address", 400);
  }
  const matches = await prisma.salesPerson.findMany({
    where: { email: { equals: email, mode: "insensitive" }, status: "active" },
    take: 2,
  });
  if (matches.length === 0) {
    throw new SalesAppAuthError(
      "No active sales person uses this email. Contact Esperanza to be added.",
      404
    );
  }
  if (matches.length > 1) {
    throw new SalesAppAuthError(
      "More than one sales person uses this email. Contact Esperanza to fix it.",
      409
    );
  }
  return matches[0]!;
}

function signToken(salesPersonId: string) {
  return jwt.sign({ salesPersonId, type: TOKEN_TYPE }, env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function signSetupToken(salesPersonId: string) {
  return jwt.sign({ salesPersonId, type: SETUP_TOKEN_TYPE }, env.JWT_SECRET, {
    expiresIn: SETUP_TOKEN_TTL,
  });
}

function verifyTyped(token: string, type: string): string | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { salesPersonId?: string; type?: string };
    return decoded.type === type && decoded.salesPersonId ? decoded.salesPersonId : null;
  } catch {
    return null;
  }
}

/** Sales person id from an app token (null if missing/invalid/wrong type). */
export const verifySalesAppToken = (token: string) => verifyTyped(token, TOKEN_TYPE);

/** Sends a new temporary PIN by email and SMS. */
async function sendTempPin(person: { id: string; name: string; email: string | null; phone: string | null; tempPinSentAt: Date | null }) {
  if (person.tempPinSentAt && Date.now() - person.tempPinSentAt.getTime() < TEMP_PIN_RESEND_AFTER_MS) {
    throw new SalesAppAuthError("A code was just sent. Wait a minute before asking for another.", 429);
  }

  const tempPin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const mobile = normalizeMobile(person.phone);
  const firstName = person.name.split(" ")[0] || person.name;

  const [emailResult, smsResult] = await Promise.allSettled([
    person.email
      ? sendEmail({
          to: person.email,
          subject: "Your Esperanza Sales app code",
          text: `Hi ${firstName}, your Esperanza Sales app code is ${tempPin}. It expires in 15 minutes. If you didn't ask for it, ignore this message.`,
          html: `<p>Hi ${firstName},</p><p>Your Esperanza Sales app code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${tempPin}</p><p>It expires in 15 minutes. Enter it in the app, then choose your 4-digit PIN.</p><p>If you didn't ask for this code, ignore this email.</p>`,
        })
      : Promise.reject(new Error("no email")),
    mobile
      ? sendSingleSms({
          mobile,
          message: `Esperanza Sales app code: ${tempPin}. Expires in 15 minutes.`,
        })
      : Promise.reject(new Error("no phone")),
  ]);

  const sentByEmail = emailResult.status === "fulfilled";
  const sentBySms = smsResult.status === "fulfilled";
  if (!sentByEmail && !sentBySms) {
    console.error("[Sales app] Temp PIN not delivered", { emailResult, smsResult });
    throw new SalesAppAuthError("We couldn't send the code. Try again, or contact Esperanza.", 502);
  }

  await prisma.salesPerson.update({
    where: { id: person.id },
    data: {
      tempPinHash: await bcrypt.hash(tempPin, 10),
      tempPinExpiresAt: new Date(Date.now() + TEMP_PIN_TTL_MS),
      tempPinSentAt: new Date(),
      tempPinAttempts: 0,
    },
  });

  return {
    sentTo: {
      ...(sentByEmail && person.email ? { email: maskEmail(person.email) } : {}),
      ...(sentBySms && mobile ? { phone: maskPhone(mobile) } : {}),
    },
  };
}

/**
 * Step 1. Has this person set a PIN? If yes the app asks for it; if not, a
 * temporary PIN is sent now.
 */
export async function start(email: unknown) {
  const person = await findActiveByEmail(email);
  if (person.pinHash) {
    return { next: "pin" as const, name: person.name };
  }
  const sent = await sendTempPin(person);
  return { next: "temp_pin" as const, name: person.name, ...sent };
}

/** Forgot PIN / resend: send a new temporary PIN. */
export async function requestTempPin(email: unknown) {
  const person = await findActiveByEmail(email);
  const sent = await sendTempPin(person);
  return { next: "temp_pin" as const, name: person.name, ...sent };
}

/** Checks the temporary PIN; returns a short-lived token for setting the PIN. */
export async function verifyTempPin(email: unknown, tempPin: unknown) {
  const person = await findActiveByEmail(email);
  const code = String(tempPin ?? "").trim();

  if (!person.tempPinHash || !person.tempPinExpiresAt || person.tempPinExpiresAt.getTime() < Date.now()) {
    throw new SalesAppAuthError("This code has expired. Ask for a new one.", 400);
  }
  if (person.tempPinAttempts >= TEMP_PIN_MAX_ATTEMPTS) {
    throw new SalesAppAuthError("Too many wrong codes. Ask for a new one.", 429);
  }
  if (!(await bcrypt.compare(code, person.tempPinHash))) {
    await prisma.salesPerson.update({
      where: { id: person.id },
      data: { tempPinAttempts: { increment: 1 } },
    });
    throw new SalesAppAuthError("That code is not correct.", 401);
  }

  // Used: can't be entered again
  await prisma.salesPerson.update({
    where: { id: person.id },
    data: { tempPinHash: null, tempPinExpiresAt: null, tempPinAttempts: 0 },
  });
  return { setupToken: signSetupToken(person.id) };
}

/** Sets the 4-digit PIN (after a temporary PIN) and signs in. */
export async function setPin(setupToken: unknown, pin: unknown) {
  const salesPersonId = verifyTyped(String(setupToken ?? ""), SETUP_TOKEN_TYPE);
  if (!salesPersonId) {
    throw new SalesAppAuthError("This step has expired. Start again with your email.", 401);
  }
  const newPin = String(pin ?? "");
  if (!PIN_RE.test(newPin)) {
    throw new SalesAppAuthError("The PIN must be exactly 4 digits.", 400);
  }
  const person = await prisma.salesPerson.findFirst({
    where: { id: salesPersonId, status: "active" },
  });
  if (!person) throw new SalesAppAuthError("Your account is not active.", 403);

  const updated = await prisma.salesPerson.update({
    where: { id: person.id },
    data: {
      pinHash: await bcrypt.hash(newPin, 10),
      pinSetAt: new Date(),
      failedPinAttempts: 0,
      pinLockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
  return { token: signToken(updated.id), salesPerson: toProfile(updated) };
}

/** Email + PIN sign-in. */
export async function login(email: unknown, pin: unknown) {
  const person = await findActiveByEmail(email);
  if (!person.pinHash) {
    throw new SalesAppAuthError("You haven't set a PIN yet. Start again with your email.", 400);
  }
  if (person.pinLockedUntil && person.pinLockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((person.pinLockedUntil.getTime() - Date.now()) / 60000);
    throw new SalesAppAuthError(
      `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your PIN.`,
      429
    );
  }
  const ok = PIN_RE.test(String(pin ?? "")) && (await bcrypt.compare(String(pin), person.pinHash));
  if (!ok) {
    const failures = person.failedPinAttempts + 1;
    await prisma.salesPerson.update({
      where: { id: person.id },
      data:
        failures >= PIN_MAX_FAILURES
          ? { failedPinAttempts: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MS) }
          : { failedPinAttempts: failures },
    });
    throw new SalesAppAuthError(
      failures >= PIN_MAX_FAILURES
        ? "Too many wrong PINs. Try again in 15 minutes, or reset your PIN."
        : "Wrong PIN.",
      401
    );
  }

  const updated = await prisma.salesPerson.update({
    where: { id: person.id },
    data: { failedPinAttempts: 0, pinLockedUntil: null, lastLoginAt: new Date() },
  });
  return { token: signToken(updated.id), salesPerson: toProfile(updated) };
}

export async function getProfile(salesPersonId: string) {
  const person = await prisma.salesPerson.findFirst({
    where: { id: salesPersonId, status: "active" },
  });
  return person ? toProfile(person) : null;
}
