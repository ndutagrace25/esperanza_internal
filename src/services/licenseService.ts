import { createPrivateKey, randomBytes, sign } from "node:crypto";
import type { ClientSubscription } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

// Ventura licensing.
//
// A licence is "VPL1.<payload>.<signature>": base64url JSON payload signed
// with Ed25519 (LICENSE_PRIVATE_KEY). The Ventura backend only has the public
// key, so it can verify licences but never create them, and editing the
// payload (e.g. the expiry date in the hotel's database) breaks the signature.
//
// Hotels pull their licence: the Ventura backend checks in daily with its
// company code and installation id (POST /api/licence/check-in) and stores
// whatever licence comes back. Renewing a subscription here just changes
// expiryDate/status; the next check-in picks it up.

export const LICENSE_PREFIX = "VPL1";
export const LICENSE_GRACE_DAYS = 3;

// Safeguards so the switch to signed licences never locks a paying client:
// - A server whose bound installation stopped checking in this long ago can
//   take over the licence automatically (usually the same server after its
//   data volume was lost). The Ventura backend keeps working for 3 days while
//   this happens. A copy running beside a live server never gets it.
const AUTO_REBIND_AFTER_MS = 24 * 60 * 60 * 1000;
// - First check-in: if the hotel already runs on a later expiry than ours, we
//   keep theirs (flagged for review), capped this far ahead so a hand-edited
//   date can't buy years.
const MAX_ADOPTED_EXPIRY_MS = 400 * 24 * 60 * 60 * 1000;

export type LicensePayload = {
  v: 1;
  /** Subscription id */
  lid: string;
  /** Company code in the Ventura system */
  code: string;
  company: string;
  /** KRA PIN when known (informational) */
  pin: string | null;
  /** Installation the licence is bound to */
  iid: string;
  status: ClientSubscription["status"];
  /** Licence valid until this instant (end of the expiry day, Nairobi time) */
  exp: string;
  /** Days the system keeps working after exp before it locks */
  grace: number;
  /** When this licence was issued - also a trusted "now" for the backend */
  iat: string;
};

const INSTALLATION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const base64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cachedKey: ReturnType<typeof createPrivateKey> | null = null;
const getPrivateKey = () => {
  if (cachedKey) return cachedKey;
  if (!env.LICENSE_PRIVATE_KEY) {
    throw new Error("LICENSE_PRIVATE_KEY is not set. Run `npm run license:keygen`.");
  }
  cachedKey = createPrivateKey(Buffer.from(env.LICENSE_PRIVATE_KEY, "base64").toString("utf8"));
  return cachedKey;
};

export function signLicense(payload: LicensePayload): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = sign(null, Buffer.from(`${LICENSE_PREFIX}.${body}`), getPrivateKey());
  return `${LICENSE_PREFIX}.${body}.${base64url(signature)}`;
}

/**
 * expiryDate is stored as midnight UTC of the expiry day. The licence lasts to
 * the end of that day in Nairobi (UTC+3), i.e. 21:00 UTC that day.
 */
function endOfExpiryDayNairobi(expiryDate: Date): Date {
  return new Date(
    Date.UTC(
      expiryDate.getUTCFullYear(),
      expiryDate.getUTCMonth(),
      expiryDate.getUTCDate() + 1
    ) -
      3 * 60 * 60 * 1000
  );
}

type SubscriptionWithClient = ClientSubscription & {
  client: { companyName: string; taxId: string | null };
};

function buildLicense(sub: SubscriptionWithClient, installationId: string): string {
  return signLicense({
    v: 1,
    lid: sub.id,
    code: sub.code,
    company: sub.client.companyName,
    pin: sub.client.taxId?.trim() || null,
    iid: installationId,
    status: sub.status,
    exp: endOfExpiryDayNairobi(sub.expiryDate).toISOString(),
    grace: LICENSE_GRACE_DAYS,
    iat: new Date().toISOString(),
  });
}

function normalizeCode(code: string): string {
  return code.trim().replace(/^\/?company\/update\/?/i, "");
}

async function findSubscriptionByCode(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return prisma.clientSubscription.findFirst({
    where: { code: normalized },
    include: { client: { select: { companyName: true, taxId: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export class LicenseError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

/**
 * Called by the Ventura backend (public endpoint). Binds the licence to the
 * installation on its first check-in; after that, another installation needs
 * the activation key from support (moving to a new server).
 */
export async function checkIn(input: {
  code: string;
  installationId: string;
  appVersion?: string | undefined;
  activationKey?: string | undefined;
  ip?: string | undefined;
  /** The hotel's current expiry (YYYY-MM-DD), sent until its first signed licence */
  currentExpiry?: string | undefined;
}): Promise<{ license: string }> {
  const installationId = input.installationId?.trim() || "";
  if (!INSTALLATION_ID_RE.test(installationId)) {
    throw new LicenseError("Invalid installation id", 400);
  }

  const sub = await findSubscriptionByCode(input.code || "");
  if (!sub) {
    throw new LicenseError("No subscription found for this company code", 404);
  }

  const activationKey = input.activationKey?.trim().toUpperCase();
  const keyMatches = Boolean(activationKey && sub.activationKey === activationKey);

  const now = Date.now();
  const extra: {
    expiryDate?: Date;
    expiryAdjustedFrom?: Date;
    expiryAdjustedAt?: Date;
    previousInstallationId?: string;
    reboundAt?: Date;
  } = {};

  if (sub.installationId && sub.installationId !== installationId && !keyMatches) {
    // Auto re-bind only when the bound server checked in before (so it's an
    // online server) and has gone quiet. Offline-code servers never check in,
    // so moving those always goes through support.
    const boundServerQuiet =
      sub.lastCheckInAt !== null && now - sub.lastCheckInAt.getTime() > AUTO_REBIND_AFTER_MS;
    if (!boundServerQuiet) {
      // Possibly a copied system: record it so support can see it
      await prisma.clientSubscription.update({
        where: { id: sub.id },
        data: { conflictInstallationId: installationId, conflictAt: new Date() },
      });
      throw new LicenseError(
        "This licence is in use on another installation. Contact support to move it to this server.",
        409
      );
    }
    extra.previousInstallationId = sub.installationId;
    extra.reboundAt = new Date();
  }

  // First check-in (never licensed): don't cut the hotel short
  if (!sub.licenseIssuedAt && input.currentExpiry) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.currentExpiry.trim());
    if (match) {
      const hotelExpiry = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      if (
        hotelExpiry.getTime() > sub.expiryDate.getTime() &&
        hotelExpiry.getTime() <= now + MAX_ADOPTED_EXPIRY_MS
      ) {
        extra.expiryDate = hotelExpiry;
        extra.expiryAdjustedFrom = sub.expiryDate;
        extra.expiryAdjustedAt = new Date();
        sub.expiryDate = hotelExpiry; // used for the licence below
      }
    }
  }

  const license = buildLicense(sub, installationId);
  await prisma.clientSubscription.update({
    where: { id: sub.id },
    data: {
      ...extra,
      installationId,
      ...(keyMatches && { activationKey: null }), // one-time use
      licenseToken: license,
      licenseIssuedAt: new Date(),
      lastCheckInAt: new Date(),
      lastCheckInIp: input.ip?.slice(0, 100) ?? null,
      lastCheckInVersion: input.appVersion?.slice(0, 50) ?? null,
    },
  });

  return { license };
}

/**
 * Support: licence code for a server that can't reach us (LAN-only). Binds the
 * subscription to that installation.
 */
export async function issueOfflineLicense(subscriptionId: string, installationId: string) {
  const iid = installationId?.trim() || "";
  if (!INSTALLATION_ID_RE.test(iid)) {
    throw new LicenseError("Invalid installation id", 400);
  }
  const sub = await prisma.clientSubscription.findUnique({
    where: { id: subscriptionId },
    include: { client: { select: { companyName: true, taxId: true } } },
  });
  if (!sub) throw new LicenseError("Client subscription not found", 404);

  const license = buildLicense(sub, iid);
  await prisma.clientSubscription.update({
    where: { id: sub.id },
    data: {
      installationId: iid,
      licenseToken: license,
      licenseIssuedAt: new Date(),
      conflictInstallationId: null,
      conflictAt: null,
    },
  });
  return { license };
}

/** Support: one-time key that lets a new server take over the licence. */
export async function createActivationKey(subscriptionId: string) {
  const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 chars
  const activationKey = `${raw.slice(0, 5)}-${raw.slice(5)}`;
  await prisma.clientSubscription.update({
    where: { id: subscriptionId },
    data: { activationKey },
  });
  return { activationKey };
}

/** Support: unbind, so the next installation that checks in takes the licence. */
export async function resetInstallation(subscriptionId: string) {
  await prisma.clientSubscription.update({
    where: { id: subscriptionId },
    data: {
      installationId: null,
      conflictInstallationId: null,
      conflictAt: null,
    },
  });
}
