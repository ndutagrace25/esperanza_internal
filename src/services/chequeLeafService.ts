import { prisma } from "../lib/prisma.js";
import { Prisma, type ChequeLeaf, type ChequeLeafStatus } from "@prisma/client";
import { createLog } from "./systemLogService.js";

export type CreateChequeLeafData = {
  payee: string;
  amount: number | string;
  description?: string | null;
  chequeDate?: string | Date | null;
};

export type UpdateChequeLeafData = Partial<CreateChequeLeafData>;

export type ChequeLeafListOptions = {
  page?: number;
  limit?: number;
  search?: string;
  status?: ChequeLeafStatus;
};

export type PaginatedResult<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const recordedBySelect = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

/**
 * Postgres advisory lock key held while assigning a cheque number, so cheques
 * saved at the same time are numbered one after another instead of clashing.
 */
const CHEQUE_NUMBER_LOCK_KEY = 7243001;

function parseAmount(value: number | string | undefined): Prisma.Decimal {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(
      typeof value === "string" ? value.trim() || "NaN" : value ?? NaN
    );
  } catch {
    throw new Error("Amount must be a valid number");
  }
  if (amount.isNaN() || amount.lte(0)) {
    throw new Error("Amount must be greater than 0");
  }
  return amount.toDecimalPlaces(2);
}

function parseChequeDate(value: string | Date | null | undefined): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error("Invalid cheque date");
  }
  return date;
}

async function getNextChequeNumber(
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const result = await tx.chequeLeaf.aggregate({ _max: { chequeNumber: true } });
  return (result._max.chequeNumber ?? 0) + 1;
}

export async function findNextChequeNumber(): Promise<number> {
  return getNextChequeNumber();
}

export async function findAll(options: ChequeLeafListOptions = {}) {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const skip = (page - 1) * limit;

  const searchRaw = options.search?.trim();
  const searchNumber = searchRaw && /^\d+$/.test(searchRaw)
    ? parseInt(searchRaw, 10)
    : undefined;

  const where: Prisma.ChequeLeafWhereInput = {
    ...(options.status && { status: options.status }),
    ...(searchRaw && {
      OR: [
        { payee: { contains: searchRaw, mode: "insensitive" } },
        { description: { contains: searchRaw, mode: "insensitive" } },
        ...(searchNumber !== undefined ? [{ chequeNumber: searchNumber }] : []),
      ],
    }),
  };

  const [total, data, issuedTotal] = await Promise.all([
    prisma.chequeLeaf.count({ where }),
    prisma.chequeLeaf.findMany({
      where,
      include: { recordedBy: { select: recordedBySelect } },
      orderBy: { chequeNumber: "desc" },
      skip,
      take: limit,
    }),
    options.status === "CANCELLED"
      ? { _sum: { amount: null } }
      : prisma.chequeLeaf.aggregate({
          where: { ...where, status: "ISSUED" },
          _sum: { amount: true },
        }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    // Sum of issued (not cancelled) cheques matching the current filters
    issuedAmountTotal: issuedTotal._sum.amount ?? new Prisma.Decimal(0),
  };
}

export async function findById(id: string) {
  return prisma.chequeLeaf.findUnique({
    where: { id },
    include: { recordedBy: { select: recordedBySelect } },
  });
}

export async function create(
  data: CreateChequeLeafData,
  performedBy?: string
): Promise<ChequeLeaf> {
  if (!data.payee || !data.payee.trim()) {
    throw new Error("Payee is required");
  }
  const amount = parseAmount(data.amount);
  const chequeDate = parseChequeDate(data.chequeDate);

  const chequeLeaf = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHEQUE_NUMBER_LOCK_KEY})`;
    const chequeNumber = await getNextChequeNumber(tx);
    return tx.chequeLeaf.create({
      data: {
        chequeNumber,
        payee: data.payee.trim(),
        amount,
        description: data.description?.trim() || null,
        ...(chequeDate && { chequeDate }),
        ...(performedBy && { recordedBy: { connect: { id: performedBy } } }),
      },
    });
  });

  await createLog({
    action: "CREATE",
    entityType: "ChequeLeaf",
    entityId: chequeLeaf.id,
    ...(performedBy && { performedBy }),
    newData: chequeLeaf,
  });

  return chequeLeaf;
}

export async function update(
  id: string,
  data: UpdateChequeLeafData,
  performedBy?: string
): Promise<ChequeLeaf> {
  const existing = await prisma.chequeLeaf.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Cheque leaf not found");
  }
  if (existing.status === "CANCELLED") {
    throw new Error("Cancelled cheque leaves cannot be edited");
  }

  const updateData: Prisma.ChequeLeafUpdateInput = {};
  if (data.payee !== undefined) {
    if (!data.payee.trim()) {
      throw new Error("Payee is required");
    }
    updateData.payee = data.payee.trim();
  }
  if (data.amount !== undefined) {
    updateData.amount = parseAmount(data.amount);
  }
  if (data.description !== undefined) {
    updateData.description = data.description?.trim() || null;
  }
  if (data.chequeDate !== undefined) {
    const chequeDate = parseChequeDate(data.chequeDate);
    if (!chequeDate) {
      throw new Error("Cheque date is required");
    }
    updateData.chequeDate = chequeDate;
  }

  const chequeLeaf = await prisma.chequeLeaf.update({
    where: { id },
    data: updateData,
  });

  await createLog({
    action: "UPDATE",
    entityType: "ChequeLeaf",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    newData: chequeLeaf,
  });

  return chequeLeaf;
}

/**
 * Mark a leaf as cancelled (spoiled, voided or stopped). The record and its
 * number are kept so the cheque book sequence has no gaps.
 */
export async function cancel(
  id: string,
  reason: string | undefined,
  performedBy?: string
): Promise<ChequeLeaf> {
  const existing = await prisma.chequeLeaf.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Cheque leaf not found");
  }
  if (existing.status === "CANCELLED") {
    throw new Error("Cheque leaf is already cancelled");
  }
  if (!reason || !reason.trim()) {
    throw new Error("A reason is required to cancel a cheque leaf");
  }

  const chequeLeaf = await prisma.chequeLeaf.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledReason: reason.trim(),
      cancelledAt: new Date(),
    },
  });

  await createLog({
    action: "UPDATE",
    entityType: "ChequeLeaf",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    newData: chequeLeaf,
    metadata: { operation: "CANCEL" },
  });

  return chequeLeaf;
}
