import { prisma } from "../lib/prisma.js";
import * as clientSubscriptionService from "./clientSubscriptionService.js";
import { createLog } from "./systemLogService.js";

// Sales app: a sales person sees only the clients they brought in (clients of
// sales where they're the commission sales person), with each client's
// licence expiry and the commission they earn (not the sale totals). The only
// change they can make is a client's licence expiry date.

export class SalesAppClientError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export type SalesAppClientRow = {
  clientId: string;
  clientName: string;
  /** The client's licence (soonest-expiring subscription that isn't cancelled) */
  subscription: { id: string; code: string; expiryDate: string; status: string } | null;
  /** Other subscriptions the client has (rare) */
  otherSubscriptions: number;
  /** Sum of this sales person's commission on the client's sales */
  commissionAmount: number;
  commissionPaidAmount: number;
};

/** Clients brought in by this sales person, soonest licence expiry first. */
export async function listClients(salesPersonId: string, search?: string): Promise<SalesAppClientRow[]> {
  const sales = await prisma.sale.findMany({
    where: { commissionSalesPersonId: salesPersonId, status: { not: "CANCELLED" } },
    select: {
      commissionAmount: true,
      commissionPaidAmount: true,
      client: {
        select: {
          id: true,
          companyName: true,
          subscriptions: {
            where: { status: { not: "cancelled" } },
            select: { id: true, code: true, expiryDate: true, status: true },
            orderBy: { expiryDate: "asc" },
          },
        },
      },
    },
  });

  const byClient = new Map<string, SalesAppClientRow>();
  for (const sale of sales) {
    const { client } = sale;
    const row = byClient.get(client.id) ?? {
      clientId: client.id,
      clientName: client.companyName,
      subscription: client.subscriptions[0]
        ? {
            id: client.subscriptions[0].id,
            code: client.subscriptions[0].code,
            expiryDate: client.subscriptions[0].expiryDate.toISOString(),
            status: client.subscriptions[0].status,
          }
        : null,
      otherSubscriptions: Math.max(client.subscriptions.length - 1, 0),
      commissionAmount: 0,
      commissionPaidAmount: 0,
    };
    row.commissionAmount += Number(sale.commissionAmount);
    row.commissionPaidAmount += Number(sale.commissionPaidAmount);
    byClient.set(client.id, row);
  }

  const q = search?.trim().toLowerCase();
  return Array.from(byClient.values())
    .filter((row) => !q || row.clientName.toLowerCase().includes(q))
    .map((row) => ({
      ...row,
      commissionAmount: Math.round(row.commissionAmount * 100) / 100,
      commissionPaidAmount: Math.round(row.commissionPaidAmount * 100) / 100,
    }))
    .sort((a, b) => {
      // Soonest expiry first; clients without a licence last
      if (!a.subscription && !b.subscription) return a.clientName.localeCompare(b.clientName);
      if (!a.subscription) return 1;
      if (!b.subscription) return -1;
      return a.subscription.expiryDate.localeCompare(b.subscription.expiryDate);
    });
}

/**
 * Update a licence expiry - only for a client this sales person brought in.
 * Same as renewing in the internal system (status back to active; the client
 * picks it up at its next licence check-in).
 */
export async function updateExpiry(salesPersonId: string, subscriptionId: string, expiryDate: unknown) {
  const value = String(expiryDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new SalesAppClientError("Choose a valid expiry date", 400);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (value < today) {
    throw new SalesAppClientError("The expiry date can't be in the past", 400);
  }

  const subscription = await prisma.clientSubscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, clientId: true, expiryDate: true, status: true },
  });
  if (!subscription || subscription.status === "cancelled") {
    throw new SalesAppClientError("Licence not found", 404);
  }

  const ownsClient = await prisma.sale.findFirst({
    where: {
      clientId: subscription.clientId,
      commissionSalesPersonId: salesPersonId,
      status: { not: "CANCELLED" },
    },
    select: { id: true },
  });
  if (!ownsClient) {
    // Same message as not found: don't reveal other people's clients
    throw new SalesAppClientError("Licence not found", 404);
  }

  const person = await prisma.salesPerson.findUnique({
    where: { id: salesPersonId },
    select: { name: true, employeeId: true },
  });

  const updated = await clientSubscriptionService.renew(
    subscriptionId,
    { licenseExpiryDate: value },
    person?.employeeId ?? undefined
  );

  await createLog({
    action: "UPDATE",
    entityType: "ClientSubscription",
    entityId: subscriptionId,
    oldData: { expiryDate: subscription.expiryDate },
    newData: { expiryDate: updated.expiryDate },
    metadata: JSON.stringify({
      source: "sales_app",
      salesPersonId,
      salesPersonName: person?.name,
    }),
  });

  return {
    id: updated.id,
    code: updated.code,
    expiryDate: updated.expiryDate.toISOString(),
    status: updated.status,
  };
}
