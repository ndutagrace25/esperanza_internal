import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { createLog } from "./systemLogService.js";

export type CreateClientSubscriptionData = {
  clientId: string;
  code: string;
  apiBaseUrl: string;
  expiryDate: string | Date;
  status?: "active" | "expired" | "suspended" | "cancelled";
};

export type UpdateClientSubscriptionData = Partial<{
  clientId: string;
  code: string;
  apiBaseUrl: string;
  expiryDate: string | Date;
  status: "active" | "expired" | "suspended" | "cancelled";
}>;

export type RenewClientSubscriptionData = {
  licenseExpiryDate: string;
};

export type ListClientSubscriptionsOptions = {
  clientId?: string;
  /** Inclusive start date (YYYY-MM-DD) */
  expiryFrom?: string;
  /** Inclusive end date (YYYY-MM-DD) */
  expiryTo?: string;
};

const clientSelect = {
  id: true,
  companyName: true,
  contactPerson: true,
  email: true,
} as const;

function normalizeApiBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function normalizeSubscriptionCode(code: string): string {
  return code.trim().replace(/^\/?company\/update\/?/i, "");
}

function parseExpiryDate(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid expiry date");
    }
    return value;
  }

  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const y = Number(dateOnly[1]);
    const m = Number(dateOnly[2]);
    const d = Number(dateOnly[3]);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid expiry date");
  }
  return parsed;
}

/** YYYY-MM-DD for external license API */
function toLicenseExpiryDateString(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid license expiry date");
  }
  return d.toISOString().slice(0, 10);
}

function parseFilterDateStart(dateStr: string): Date {
  const parts = dateStr.trim().split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) {
    throw new Error("Invalid expiryFrom date");
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function parseFilterDateEnd(dateStr: string): Date {
  const parts = dateStr.trim().split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) {
    throw new Error("Invalid expiryTo date");
  }
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

export async function findAll(options: ListClientSubscriptionsOptions = {}) {
  const where: Prisma.ClientSubscriptionWhereInput = {};

  const clientId = options.clientId?.trim();
  if (clientId) {
    where.clientId = clientId;
  }

  const expiryFrom = options.expiryFrom?.trim();
  const expiryTo = options.expiryTo?.trim();
  if (expiryFrom || expiryTo) {
    const expiryDate: Prisma.DateTimeFilter = {};
    if (expiryFrom) {
      expiryDate.gte = parseFilterDateStart(expiryFrom);
    }
    if (expiryTo) {
      expiryDate.lte = parseFilterDateEnd(expiryTo);
    }
    where.expiryDate = expiryDate;
  }

  return prisma.clientSubscription.findMany({
    where,
    include: {
      client: { select: clientSelect },
    },
    orderBy: [
      { expiryDate: "asc" },
      { client: { companyName: "asc" } },
    ],
  });
}

export async function findById(id: string) {
  return prisma.clientSubscription.findUnique({
    where: { id },
    include: {
      client: { select: clientSelect },
    },
  });
}

export async function create(
  data: CreateClientSubscriptionData,
  performedBy?: string
) {
  const client = await prisma.client.findUnique({
    where: { id: data.clientId },
    select: { id: true },
  });
  if (!client) {
    throw new Error("Client not found");
  }

  const subscription = await prisma.clientSubscription.create({
    data: {
      clientId: data.clientId,
      code: normalizeSubscriptionCode(data.code),
      apiBaseUrl: normalizeApiBaseUrl(data.apiBaseUrl),
      expiryDate: parseExpiryDate(data.expiryDate),
      status: data.status ?? "active",
    },
    include: {
      client: { select: clientSelect },
    },
  });

  await createLog({
    action: "CREATE",
    entityType: "ClientSubscription",
    entityId: subscription.id,
    ...(performedBy && { performedBy }),
    newData: subscription,
    metadata: JSON.stringify({ clientId: data.clientId }),
  });

  return subscription;
}

export async function update(
  id: string,
  data: UpdateClientSubscriptionData,
  performedBy?: string
) {
  const existing = await prisma.clientSubscription.findUnique({
    where: { id },
  });
  if (!existing) {
    throw new Error("Client subscription not found");
  }

  if (data.clientId && data.clientId !== existing.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: data.clientId },
      select: { id: true },
    });
    if (!client) {
      throw new Error("Client not found");
    }
  }

  const updateData: Prisma.ClientSubscriptionUpdateInput = {};
  if (data.clientId != null) updateData.client = { connect: { id: data.clientId } };
  if (data.code != null) updateData.code = normalizeSubscriptionCode(data.code);
  if (data.apiBaseUrl != null) {
    updateData.apiBaseUrl = normalizeApiBaseUrl(data.apiBaseUrl);
  }
  if (data.expiryDate != null) {
    updateData.expiryDate = parseExpiryDate(data.expiryDate);
  }
  if (data.status != null) updateData.status = data.status;

  const subscription = await prisma.clientSubscription.update({
    where: { id },
    data: updateData,
    include: {
      client: { select: clientSelect },
    },
  });

  await createLog({
    action: "UPDATE",
    entityType: "ClientSubscription",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    newData: subscription,
    metadata: JSON.stringify({ clientId: subscription.clientId }),
  });

  return subscription;
}

/**
 * Update local expiry date (and set status to active).
 */
export async function renew(
  id: string,
  data: RenewClientSubscriptionData,
  performedBy?: string
) {
  const subscription = await prisma.clientSubscription.findUnique({
    where: { id },
    include: {
      client: { select: clientSelect },
    },
  });
  if (!subscription) {
    throw new Error("Client subscription not found");
  }

  const newExpiry = parseExpiryDate(data.licenseExpiryDate);

  const updated = await prisma.clientSubscription.update({
    where: { id },
    data: {
      expiryDate: newExpiry,
      status: "active",
    },
    include: {
      client: { select: clientSelect },
    },
  });

  await createLog({
    action: "UPDATE",
    entityType: "ClientSubscription",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: subscription,
    newData: updated,
    metadata: JSON.stringify({
      clientId: subscription.clientId,
      renewed: true,
      licenseExpiryDate: toLicenseExpiryDateString(data.licenseExpiryDate),
    }),
  });

  return updated;
}
