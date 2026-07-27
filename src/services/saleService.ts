import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import type { CommissionType, PaymentMethod, Sale } from "@prisma/client";
import { createLog } from "./systemLogService.js";
import {
  extendClientLicense,
  updateClientLicenseExpiryOnly,
  sendPaymentReceivedNotifications,
} from "./clientLicenseService.js";

export type FirstInstallmentData = {
  amount: number | string;
  paidAt?: string | Date;
  notes?: string | null;
};

export type CreateSaleData = Omit<
  Prisma.SaleCreateInput,
  | "client"
  | "items"
  | "createdAt"
  | "updatedAt"
  | "saleNumber"
  | "totalAmount"
  | "commissionSalesPerson"
  | "commissionAmount"
  | "commissionPaidAmount"
> & {
  clientId: string;
  items?: Array<Omit<CreateSaleItemData, "saleId">>;
  firstInstallment?: FirstInstallmentData;
  commissionSalesPersonId?: string | null;
};

export type UpdateSaleData = Partial<
  Omit<
    Prisma.SaleUpdateInput,
    | "client"
    | "items"
    | "createdAt"
    | "updatedAt"
    | "saleNumber"
    | "totalAmount"
    | "commissionSalesPerson"
    | "commissionAmount"
    | "commissionPaidAmount"
  >
> & {
  clientId?: string;
  commissionSalesPersonId?: string | null;
};

export type CreateSaleItemData = Omit<
  Prisma.SaleItemCreateInput,
  "sale" | "product" | "createdAt" | "updatedAt"
> & {
  saleId: string;
  productId: string;
};

export type UpdateSaleItemData = Partial<
  Omit<
    Prisma.SaleItemUpdateInput,
    "sale" | "product" | "createdAt" | "updatedAt"
  >
>;

export type PaginationOptions = {
  page?: number;
  limit?: number;
  /** Case-insensitive search on sale number, client fields, and line-item products */
  search?: string;
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

export type UnpaidSalesTotals = {
  /** Non-cancelled sales that still have an unpaid balance */
  saleCount: number;
  /**
   * Sum of paidAmount on those open-balance sales, plus all paidAmount on
   * cancelled sales (money kept; remaining balance on cancelled sales excluded).
   */
  totalPaid: string;
  /** Remaining balance on non-cancelled sales only */
  totalOutstanding: string;
  /** Same as totalPaid + totalOutstanding (value on open-balance sales plus payments on cancelled sales) */
  totalSalesAmount: string;
};

/**
 * Outstanding: non-cancelled sales where paidAmount is below totalAmount.
 * Collected: paidAmount on those sales plus every paidAmount on cancelled sales
 * (cancelled balances are not owed).
 */
export async function getUnpaidSalesTotals(): Promise<UnpaidSalesTotals> {
  const rows = await prisma.$queryRaw<
    [
      {
        sale_count: bigint;
        total_paid: unknown;
        total_outstanding: unknown;
      },
    ]
  >(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE "status" <> 'CANCELLED'::"SaleStatus"
          AND "totalAmount" > "paidAmount"
      )::bigint AS sale_count,
      COALESCE(
        SUM(
          CASE
            WHEN "status" = 'CANCELLED'::"SaleStatus" THEN "paidAmount"
            WHEN "status" <> 'CANCELLED'::"SaleStatus"
              AND "totalAmount" > "paidAmount" THEN "paidAmount"
            ELSE 0
          END
        ),
        0
      ) AS total_paid,
      COALESCE(
        SUM(
          CASE
            WHEN "status" <> 'CANCELLED'::"SaleStatus"
              AND "totalAmount" > "paidAmount" THEN "totalAmount" - "paidAmount"
            ELSE 0
          END
        ),
        0
      ) AS total_outstanding
    FROM "sales"
  `);

  const row = rows[0];
  if (!row) {
    return {
      saleCount: 0,
      totalPaid: "0",
      totalOutstanding: "0",
      totalSalesAmount: "0",
    };
  }

  const toStr = (raw: unknown) =>
    raw == null
      ? "0"
      : raw instanceof Prisma.Decimal
        ? raw.toString()
        : String(raw);

  const totalPaidStr = toStr(row.total_paid);
  const totalOutstandingStr = toStr(row.total_outstanding);
  const paidDec = new Prisma.Decimal(totalPaidStr);
  const outstandingDec = new Prisma.Decimal(totalOutstandingStr);

  return {
    saleCount: Number(row.sale_count),
    totalPaid: totalPaidStr,
    totalOutstanding: totalOutstandingStr,
    totalSalesAmount: paidDec.add(outstandingDec).toString(),
  };
}

type SaleInstallmentRow = {
  id: string;
  saleId: string;
  amount: Prisma.Decimal;
  dueDate: Date | null;
  paidAt: Date;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SaleWithRelations = {
  id: string;
  saleNumber: string;
  clientId: string;
  client: {
    id: string;
    companyName: string;
    contactPerson: string | null;
    email: string | null;
    phone: string | null;
  };
  saleDate: Date;
  status: string;
  totalAmount: Prisma.Decimal;
  agreedMonthlyInstallmentAmount: Prisma.Decimal | null;
  paidAmount: Prisma.Decimal;
  completedAt: Date | null;
  notes: string | null;
  requestedPaymentDateExtension: boolean;
  paymentExtensionDueDate: Date | null;
  commissionSalesPersonId: string | null;
  commissionSalesPerson: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    status: string;
  } | null;
  commissionType: CommissionType | null;
  commissionRate: Prisma.Decimal | null;
  commissionAmount: Prisma.Decimal;
  commissionPaidAmount: Prisma.Decimal;
  items: Array<{
    id: string;
    productId: string;
    product: {
      id: string;
      name: string;
      description: string | null;
      sku: string | null;
      barcode: string | null;
    };
    quantity: number;
    unitPrice: Prisma.Decimal;
    totalPrice: Prisma.Decimal;
  }>;
  installments: SaleInstallmentRow[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Generate a unique sale number in the format SALE-YYYY-XXX
 */
async function generateSaleNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SALE-${year}-`;

  // Find the highest sale number for this year
  const lastSale = await prisma.sale.findFirst({
    where: {
      saleNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      saleNumber: "desc",
    },
  });

  let sequence = 1;
  if (lastSale) {
    // Extract the sequence number from the last sale number
    const lastSequence = parseInt(lastSale.saleNumber.replace(prefix, ""), 10);
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  // Format with leading zeros (e.g., 001, 002, ..., 100)
  const sequenceStr = sequence.toString().padStart(3, "0");
  return `${prefix}${sequenceStr}`;
}

/**
 * Calculate total amount from sale items
 */
function calculateTotalAmount(
  items: Array<{
    quantity: number;
    unitPrice:
      | number
      | string
      | Prisma.Decimal
      | Prisma.DecimalJsLike
      | unknown;
  }>
): Prisma.Decimal {
  const total = items.reduce((sum, item) => {
    const quantity = item.quantity;
    const unitPrice = Number(item.unitPrice);
    return sum + quantity * unitPrice;
  }, 0);
  return new Prisma.Decimal(total);
}

/** Block mutations on cancelled sales (they remain visible for history). */
function assertSaleNotCancelled(status: string, verb: string): void {
  if (status === "CANCELLED") {
    throw new Error(`Cannot ${verb} a cancelled sale`);
  }
}

/**
 * Derive a sale's commission amount from its (snapshotted) type/rate and totalAmount.
 * FIXED is a flat KES amount; PERCENTAGE is a percent of totalAmount.
 */
function computeCommissionAmount(
  commissionType: CommissionType | null | undefined,
  commissionRate: Prisma.Decimal | number | string | null | undefined,
  totalAmount: Prisma.Decimal
): Prisma.Decimal {
  if (!commissionType || commissionRate == null) {
    return new Prisma.Decimal(0);
  }
  const rate = new Prisma.Decimal(commissionRate);
  if (commissionType === "FIXED") {
    return rate;
  }
  return totalAmount.mul(rate).div(100);
}

/** Commission requires a sales person, and a sane value for its type. */
function assertCommissionConfig(
  commissionType: CommissionType | null | undefined,
  commissionRate: unknown,
  commissionSalesPersonId: string | null | undefined
): void {
  if (!commissionType) return;
  if (!commissionSalesPersonId) {
    throw new Error("A sales person must be set to configure commission");
  }
  const value = commissionRate != null ? Number(commissionRate) : NaN;
  if (isNaN(value) || value <= 0) {
    throw new Error("Commission value must be greater than zero");
  }
  if (commissionType === "PERCENTAGE" && value > 100) {
    throw new Error("Commission percentage cannot exceed 100");
  }
}

/** Record a SaleAmountHistory row if the sale's totalAmount actually changed. */
async function logSaleAmountChange(
  saleId: string,
  oldAmount: Prisma.Decimal,
  newAmount: Prisma.Decimal,
  performedBy?: string
): Promise<void> {
  if (oldAmount.equals(newAmount)) return;
  await prisma.saleAmountHistory.create({
    data: {
      sale: { connect: { id: saleId } },
      oldAmount,
      newAmount,
      ...(performedBy && { changedBy: { connect: { id: performedBy } } }),
    },
  });
}

export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<SaleWithRelations>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  const searchRaw = options.search?.trim();
  const searchTerm = searchRaw && searchRaw.length > 0 ? searchRaw : undefined;

  const where: Prisma.SaleWhereInput = searchTerm
    ? {
        OR: [
          { saleNumber: { contains: searchTerm, mode: "insensitive" } },
          {
            client: {
              companyName: { contains: searchTerm, mode: "insensitive" },
            },
          },
          {
            client: {
              contactPerson: { contains: searchTerm, mode: "insensitive" },
            },
          },
          {
            client: { email: { contains: searchTerm, mode: "insensitive" } },
          },
          {
            items: {
              some: {
                product: {
                  name: { contains: searchTerm, mode: "insensitive" },
                },
              },
            },
          },
          {
            items: {
              some: {
                product: {
                  sku: { contains: searchTerm, mode: "insensitive" },
                },
              },
            },
          },
        ],
      }
    : {};

  const total = await prisma.sale.count({ where });

  const sales = await prisma.sale.findMany({
    select: {
      id: true,
      saleNumber: true,
      clientId: true,
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
        },
      },
      saleDate: true,
      status: true,
      totalAmount: true,
      agreedMonthlyInstallmentAmount: true,
      paidAmount: true,
      completedAt: true,
      notes: true,
      requestedPaymentDateExtension: true,
      paymentExtensionDueDate: true,
      commissionSalesPersonId: true,
      commissionSalesPerson: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
        },
      },
      commissionType: true,
      commissionRate: true,
      commissionAmount: true,
      commissionPaidAmount: true,
      items: {
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              barcode: true,
            },
          },
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      installments: {
        select: {
          id: true,
          saleId: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { paidAt: "asc" },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      saleDate: "desc",
    },
    skip,
    take: limit,
    where,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: sales,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function findById(id: string): Promise<SaleWithRelations | null> {
  return await prisma.sale.findUnique({
    where: { id },
    select: {
      id: true,
      saleNumber: true,
      clientId: true,
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
        },
      },
      saleDate: true,
      status: true,
      totalAmount: true,
      agreedMonthlyInstallmentAmount: true,
      paidAmount: true,
      completedAt: true,
      notes: true,
      requestedPaymentDateExtension: true,
      paymentExtensionDueDate: true,
      commissionSalesPersonId: true,
      commissionSalesPerson: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
        },
      },
      commissionType: true,
      commissionRate: true,
      commissionAmount: true,
      commissionPaidAmount: true,
      items: {
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              barcode: true,
            },
          },
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      installments: {
        select: {
          id: true,
          saleId: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { paidAt: "asc" },
      },
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function findBySaleNumber(
  saleNumber: string
): Promise<SaleWithRelations | null> {
  return await prisma.sale.findUnique({
    where: { saleNumber },
    select: {
      id: true,
      saleNumber: true,
      clientId: true,
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
        },
      },
      saleDate: true,
      status: true,
      totalAmount: true,
      agreedMonthlyInstallmentAmount: true,
      paidAmount: true,
      completedAt: true,
      notes: true,
      requestedPaymentDateExtension: true,
      paymentExtensionDueDate: true,
      commissionSalesPersonId: true,
      commissionSalesPerson: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
        },
      },
      commissionType: true,
      commissionRate: true,
      commissionAmount: true,
      commissionPaidAmount: true,
      items: {
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              barcode: true,
            },
          },
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      installments: {
        select: {
          id: true,
          saleId: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { paidAt: "asc" },
      },
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function create(
  data: CreateSaleData,
  performedBy?: string
): Promise<Sale | SaleWithRelations> {
  const {
    clientId,
    items,
    firstInstallment,
    commissionSalesPersonId,
    ...saleData
  } = data;

  // Validate that items are provided
  if (!items || items.length === 0) {
    throw new Error("At least one sale item is required");
  }

  assertCommissionConfig(
    saleData.commissionType as CommissionType | null | undefined,
    saleData.commissionRate,
    commissionSalesPersonId
  );

  // Generate unique sale number
  const saleNumber = await generateSaleNumber();

  // Calculate total amount from items
  const totalAmount = calculateTotalAmount(items);

  const createData: Prisma.SaleCreateInput = {
    ...saleData,
    saleNumber,
    totalAmount,
    client: {
      connect: { id: clientId },
    },
  };

  if (commissionSalesPersonId) {
    createData.commissionSalesPerson = { connect: { id: commissionSalesPersonId } };
  }

  if (saleData.commissionType && saleData.commissionRate != null) {
    createData.commissionAmount = computeCommissionAmount(
      saleData.commissionType as CommissionType,
      saleData.commissionRate as Prisma.Decimal | number | string,
      totalAmount
    );
  }

  // Add items if provided
  if (items && items.length > 0) {
    createData.items = {
      create: items.map((item) => {
        const itemTotalPrice = new Prisma.Decimal(
          item.quantity * Number(item.unitPrice)
        );
        return {
          product: {
            connect: { id: item.productId },
          },
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: itemTotalPrice,
        };
      }),
    };
  }

  const sale = await prisma.sale.create({
    data: createData,
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
        },
      },
      commissionSalesPerson: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              barcode: true,
            },
          },
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      installments: {
        select: {
          id: true,
          saleId: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "Sale",
    entityId: sale.id,
    ...(performedBy && { performedBy }),
    newData: sale,
  });

  // Log item creations
  if (sale.items.length > 0) {
    for (const item of sale.items) {
      await createLog({
        action: "CREATE",
        entityType: "SaleItem",
        entityId: item.id,
        ...(performedBy && { performedBy }),
        newData: item,
        metadata: JSON.stringify({ saleId: sale.id }),
      });
    }
  }

  // Optionally add first installment (e.g. deposit paid at creation)
  const amount = firstInstallment?.amount != null ? Number(firstInstallment.amount) : 0;
  if (amount > 0 && firstInstallment) {
    const total = Number(sale.totalAmount);
    if (amount > total) {
      throw new Error("First installment amount cannot exceed the sale total");
    }
    const installmentData: CreateSaleInstallmentData = {
      amount: firstInstallment.amount,
      status: "PAID",
    };
    if (firstInstallment.paidAt != null) {
      installmentData.paidAt = new Date(firstInstallment.paidAt);
    }
    if (firstInstallment.notes != null && firstInstallment.notes !== "") {
      installmentData.notes = firstInstallment.notes;
    }
    await createInstallment(sale.id, installmentData, performedBy);
    const updated = await findById(sale.id);
    return updated ?? sale;
  }

  return sale;
}

export async function update(
  id: string,
  data: UpdateSaleData,
  performedBy?: string
): Promise<Sale> {
  const { clientId, commissionSalesPersonId, ...updateData } = data;

  // Get existing sale to compare
  const existingSale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: true,
    },
  });

  if (!existingSale) {
    throw new Error("Sale not found");
  }

  assertSaleNotCancelled(existingSale.status, "edit");

  const effectiveCommissionSalesPersonId =
    commissionSalesPersonId !== undefined
      ? commissionSalesPersonId
      : existingSale.commissionSalesPersonId;
  const effectiveCommissionType =
    updateData.commissionType !== undefined
      ? (updateData.commissionType as CommissionType | null)
      : existingSale.commissionType;
  const effectiveCommissionRate =
    updateData.commissionRate !== undefined
      ? updateData.commissionRate
      : existingSale.commissionRate;
  assertCommissionConfig(
    effectiveCommissionType,
    effectiveCommissionRate,
    effectiveCommissionSalesPersonId
  );

  // Build update data
  const saleUpdateData: Prisma.SaleUpdateInput = { ...updateData };

  if (clientId) {
    saleUpdateData.client = {
      connect: { id: clientId },
    };
  }

  if (commissionSalesPersonId !== undefined) {
    saleUpdateData.commissionSalesPerson =
      commissionSalesPersonId === null
        ? { disconnect: true }
        : { connect: { id: commissionSalesPersonId } };
  }

  // If items are being updated, recalculate totalAmount
  // Note: For simplicity, we'll require items to be updated separately via item endpoints
  // Recalculate from existing items
  const items = existingSale.items;
  const newTotalAmount =
    items.length > 0 ? calculateTotalAmount(items) : existingSale.totalAmount;
  if (items.length > 0) {
    saleUpdateData.totalAmount = newTotalAmount;
  }
  saleUpdateData.commissionAmount = computeCommissionAmount(
    effectiveCommissionType,
    effectiveCommissionRate as Prisma.Decimal | number | string | null | undefined,
    newTotalAmount
  );

  // When user sets a payment extension date, extend the client's system license expiry via their API
  const extensionDate =
    typeof updateData.paymentExtensionDueDate === "string"
      ? updateData.paymentExtensionDueDate.trim()
      : null;
  if (extensionDate && extensionDate.length > 0) {
    await extendClientLicense(existingSale.clientId, extensionDate);
  }

  const updatedSale = await prisma.sale.update({
    where: { id },
    data: saleUpdateData,
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
        },
      },
      commissionSalesPerson: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          status: true,
        },
      },
      items: {
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              barcode: true,
            },
          },
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      installments: {
        select: {
          id: true,
          saleId: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "Sale",
    entityId: updatedSale.id,
    ...(performedBy && { performedBy }),
    oldData: existingSale,
    newData: updatedSale,
  });

  return updatedSale;
}

export async function remove(id: string, performedBy?: string): Promise<void> {
  const existingSale = await prisma.sale.findUnique({
    where: { id },
  });

  if (!existingSale) {
    throw new Error("Sale not found");
  }

  if (existingSale.status === "CANCELLED") {
    throw new Error("Sale is already cancelled");
  }

  // Soft delete: set status to CANCELLED
  await prisma.sale.update({
    where: { id },
    data: {
      status: "CANCELLED",
    },
  });

  // Log the deletion
  await createLog({
    action: "DELETE",
    entityType: "Sale",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existingSale,
  });
}

// Sale Item operations
export async function createItem(
  saleId: string,
  data: Omit<CreateSaleItemData, "saleId">,
  performedBy?: string
): Promise<
  Prisma.SaleItemGetPayload<{
    include: {
      product: {
        select: {
          id: true;
          name: true;
          description: true;
          sku: true;
          barcode: true;
        };
      };
    };
  }>
> {
  // Verify sale exists
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
  });

  if (!sale) {
    throw new Error("Sale not found");
  }

  assertSaleNotCancelled(sale.status, "add items to");

  const itemTotalPrice = new Prisma.Decimal(
    data.quantity * Number(data.unitPrice)
  );

  const item = await prisma.saleItem.create({
    data: {
      sale: {
        connect: { id: saleId },
      },
      product: {
        connect: { id: data.productId },
      },
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      totalPrice: itemTotalPrice,
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          description: true,
          sku: true,
          barcode: true,
        },
      },
    },
  });

  // Recalculate and update sale totalAmount (+ dependent commission amount)
  const allItems = await prisma.saleItem.findMany({
    where: { saleId },
  });

  const newTotal = calculateTotalAmount(allItems);
  const newCommissionAmount = computeCommissionAmount(
    sale.commissionType,
    sale.commissionRate,
    newTotal
  );
  await prisma.sale.update({
    where: { id: saleId },
    data: { totalAmount: newTotal, commissionAmount: newCommissionAmount },
  });
  await logSaleAmountChange(saleId, sale.totalAmount, newTotal, performedBy);

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "SaleItem",
    entityId: item.id,
    ...(performedBy && { performedBy }),
    newData: item,
    metadata: JSON.stringify({ saleId }),
  });

  return item;
}

export async function updateItem(
  id: string,
  data: UpdateSaleItemData,
  performedBy?: string
): Promise<
  Prisma.SaleItemGetPayload<{
    include: {
      product: {
        select: {
          id: true;
          name: true;
          description: true;
          sku: true;
          barcode: true;
        };
      };
    };
  }>
> {
  const existingItem = await prisma.saleItem.findUnique({
    where: { id },
  });

  if (!existingItem) {
    throw new Error("Sale item not found");
  }

  const parentSale = await prisma.sale.findUnique({
    where: { id: existingItem.saleId },
    select: {
      status: true,
      totalAmount: true,
      commissionType: true,
      commissionRate: true,
    },
  });
  if (!parentSale) {
    throw new Error("Sale not found");
  }
  assertSaleNotCancelled(parentSale.status, "edit items on");

  // Recalculate totalPrice if quantity or unitPrice changed
  const quantity = data.quantity ?? existingItem.quantity;
  const unitPriceValue = data.unitPrice
    ? Number(data.unitPrice)
    : Number(existingItem.unitPrice);
  const totalPriceValue = Number(quantity) * unitPriceValue;
  const totalPrice = new Prisma.Decimal(totalPriceValue);

  const updatedItem = await prisma.saleItem.update({
    where: { id },
    data: {
      ...data,
      totalPrice,
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          description: true,
          sku: true,
          barcode: true,
        },
      },
    },
  });

  // Recalculate and update sale totalAmount (+ dependent commission amount)
  const allItems = await prisma.saleItem.findMany({
    where: { saleId: existingItem.saleId },
  });

  const newTotal = calculateTotalAmount(allItems);
  const newCommissionAmount = computeCommissionAmount(
    parentSale.commissionType,
    parentSale.commissionRate,
    newTotal
  );
  await prisma.sale.update({
    where: { id: existingItem.saleId },
    data: { totalAmount: newTotal, commissionAmount: newCommissionAmount },
  });
  await logSaleAmountChange(
    existingItem.saleId,
    parentSale.totalAmount,
    newTotal,
    performedBy
  );

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "SaleItem",
    entityId: updatedItem.id,
    ...(performedBy && { performedBy }),
    oldData: existingItem,
    newData: updatedItem,
    metadata: JSON.stringify({ saleId: existingItem.saleId }),
  });

  return updatedItem;
}

export async function deleteItem(
  id: string,
  performedBy?: string
): Promise<void> {
  const existingItem = await prisma.saleItem.findUnique({
    where: { id },
  });

  if (!existingItem) {
    throw new Error("Sale item not found");
  }

  const parentSale = await prisma.sale.findUnique({
    where: { id: existingItem.saleId },
    select: {
      status: true,
      totalAmount: true,
      commissionType: true,
      commissionRate: true,
    },
  });
  if (!parentSale) {
    throw new Error("Sale not found");
  }
  assertSaleNotCancelled(parentSale.status, "remove items from");

  const saleId = existingItem.saleId;

  await prisma.saleItem.delete({
    where: { id },
  });

  // Recalculate and update sale totalAmount (+ dependent commission amount)
  const allItems = await prisma.saleItem.findMany({
    where: { saleId },
  });

  const newTotal =
    allItems.length > 0
      ? calculateTotalAmount(allItems)
      : new Prisma.Decimal(0);
  const newCommissionAmount = computeCommissionAmount(
    parentSale.commissionType,
    parentSale.commissionRate,
    newTotal
  );
  await prisma.sale.update({
    where: { id: saleId },
    data: { totalAmount: newTotal, commissionAmount: newCommissionAmount },
  });
  await logSaleAmountChange(saleId, parentSale.totalAmount, newTotal, performedBy);

  // Log the deletion
  await createLog({
    action: "DELETE",
    entityType: "SaleItem",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existingItem,
    metadata: JSON.stringify({ saleId }),
  });
}

// --- Sale Installment types and helpers ---

export type CreateSaleInstallmentData = {
  amount: number | string | Prisma.Decimal;
  dueDate?: Date | string | null;
  paidAt?: Date | string;
  status?: "PENDING" | "PAID";
  notes?: string | null;
};

export type UpdateSaleInstallmentData = Partial<{
  amount: number | string | Prisma.Decimal;
  dueDate: Date | string | null;
  paidAt: Date | string;
  status: "PENDING" | "PAID";
  notes: string | null;
}>;

/**
 * Recalculate sale paidAmount from PAID installments and set status/completedAt when fully paid.
 */
async function recalcSalePaymentStatus(saleId: string): Promise<void> {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { installments: true },
  });
  if (!sale) return;

  const paidSum = sale.installments
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const paidAmount = new Prisma.Decimal(paidSum);
  const totalAmount = sale.totalAmount;
  const isFullyPaid = paidAmount.gte(totalAmount);

  await prisma.sale.update({
    where: { id: saleId },
    data: {
      paidAmount,
      ...(isFullyPaid
        ? { status: "COMPLETED" as const, completedAt: new Date() }
        : {
            completedAt: null,
            ...(sale.status === "COMPLETED"
              ? { status: "PENDING" as const }
              : {}),
          }),
    },
  });
}

export async function createInstallment(
  saleId: string,
  data: CreateSaleInstallmentData,
  performedBy?: string
): Promise<SaleInstallmentRow> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw new Error("Sale not found");
  assertSaleNotCancelled(sale.status, "record payments on");

  const amount = new Prisma.Decimal(data.amount);
  const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
  const status = data.status ?? "PAID";
  const dueDate = data.dueDate != null ? new Date(data.dueDate) : null;

  const installment = await prisma.saleInstallment.create({
    data: {
      saleId,
      amount,
      dueDate,
      paidAt,
      status,
      notes: data.notes ?? null,
    },
  });

  await recalcSalePaymentStatus(saleId);

  await createLog({
    action: "CREATE",
    entityType: "SaleInstallment",
    entityId: installment.id,
    ...(performedBy && { performedBy }),
    newData: installment,
    metadata: JSON.stringify({ saleId }),
  });

  // When a client pays an installment: update their license to next month 3rd and notify
  const saleWithClient = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      clientId: true,
      client: {
        select: {
          backendBaseUrl: true,
          apiUserName: true,
          apiPassword: true,
        },
      },
    },
  });
  if (
    saleWithClient?.client &&
    saleWithClient.client.backendBaseUrl?.trim() &&
    saleWithClient.client.apiUserName?.trim() &&
    saleWithClient.client.apiPassword?.trim()
  ) {
    const y = paidAt.getUTCFullYear();
    const m = paidAt.getUTCMonth();
    const nextMonth3rd = new Date(
      Date.UTC(y, m + 1, 3, 0, 0, 0, 0)
    );
    const licenseExpiryDateISO = nextMonth3rd.toISOString();
    const newExpiryFormatted = nextMonth3rd.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const currentMonthLabel = paidAt.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
    try {
      await updateClientLicenseExpiryOnly(
        saleWithClient.clientId,
        licenseExpiryDateISO
      );
      await sendPaymentReceivedNotifications(
        saleWithClient.clientId,
        currentMonthLabel,
        newExpiryFormatted
      );
    } catch (err) {
      console.error(
        "[saleService] Failed to update client license or send payment-received notifications after installment:",
        err
      );
    }
  }

  // Once the client pays an installment for the current month, clear the payment extension on the sale
  await prisma.sale.update({
    where: { id: saleId },
    data: {
      requestedPaymentDateExtension: false,
      paymentExtensionDueDate: null,
    },
  });

  return installment as SaleInstallmentRow;
}

export async function updateInstallment(
  id: string,
  data: UpdateSaleInstallmentData,
  performedBy?: string
): Promise<SaleInstallmentRow> {
  const existing = await prisma.saleInstallment.findUnique({ where: { id } });
  if (!existing) throw new Error("Installment not found");

  const parentSale = await prisma.sale.findUnique({
    where: { id: existing.saleId },
    select: { status: true },
  });
  if (!parentSale) throw new Error("Sale not found");
  assertSaleNotCancelled(parentSale.status, "edit payments on");

  const updateData: Prisma.SaleInstallmentUpdateInput = {};
  if (data.amount != null) updateData.amount = new Prisma.Decimal(data.amount);
  if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.paidAt != null) updateData.paidAt = new Date(data.paidAt);
  if (data.status != null) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const installment = await prisma.saleInstallment.update({
    where: { id },
    data: updateData,
  });

  await recalcSalePaymentStatus(existing.saleId);

  await createLog({
    action: "UPDATE",
    entityType: "SaleInstallment",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    newData: installment,
    metadata: JSON.stringify({ saleId: existing.saleId }),
  });

  return installment as SaleInstallmentRow;
}

export async function deleteInstallment(
  id: string,
  performedBy?: string
): Promise<void> {
  const existing = await prisma.saleInstallment.findUnique({ where: { id } });
  if (!existing) throw new Error("Installment not found");
  const saleId = existing.saleId;

  const parentSale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { status: true },
  });
  if (!parentSale) throw new Error("Sale not found");
  assertSaleNotCancelled(parentSale.status, "delete payments on");

  await prisma.saleInstallment.delete({ where: { id } });
  await recalcSalePaymentStatus(saleId);

  await createLog({
    action: "DELETE",
    entityType: "SaleInstallment",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    metadata: JSON.stringify({ saleId }),
  });
}

// --- Sale commission payments ---

export type RecordCommissionPaymentData = {
  amount: Prisma.Decimal | number | string;
  paymentMethod?: PaymentMethod | null;
  referenceNumber?: string | null;
  paymentDate?: Date;
  notes?: string | null;
};

/**
 * Record a payout (full or partial) of a sale's commission to its credited sales person.
 */
export async function recordCommissionPayment(
  saleId: string,
  data: RecordCommissionPaymentData,
  recordedById?: string
): Promise<Sale> {
  const sale = await prisma.sale.findUnique({ where: { id: saleId } });
  if (!sale) {
    throw new Error("Sale not found");
  }
  assertSaleNotCancelled(sale.status, "record commission payments on");

  if (!sale.commissionSalesPersonId || sale.commissionAmount.lessThanOrEqualTo(0)) {
    throw new Error("This sale has no commission to pay out");
  }

  const amount = new Prisma.Decimal(data.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new Error("Payment amount must be greater than zero");
  }

  const remaining = sale.commissionAmount.sub(sale.commissionPaidAmount);
  if (amount.greaterThan(remaining)) {
    throw new Error(
      `Payment amount exceeds remaining commission balance of ${remaining.toString()}`
    );
  }

  const newPaidAmount = sale.commissionPaidAmount.add(amount);

  const payment = await prisma.saleCommissionPayment.create({
    data: {
      sale: { connect: { id: saleId } },
      amount,
      paymentDate: data.paymentDate ?? new Date(),
      paymentMethod: data.paymentMethod ?? null,
      referenceNumber: data.referenceNumber ?? null,
      notes: data.notes ?? null,
      ...(recordedById && { recordedBy: { connect: { id: recordedById } } }),
    },
  });

  const updatedSale = await prisma.sale.update({
    where: { id: saleId },
    data: { commissionPaidAmount: newPaidAmount },
  });

  await createLog({
    action: "CREATE",
    entityType: "SaleCommissionPayment",
    entityId: payment.id,
    ...(recordedById && { performedBy: recordedById }),
    newData: payment,
    metadata: JSON.stringify({ saleId }),
  });

  return updatedSale;
}

export async function getCommissionPayments(saleId: string) {
  return prisma.saleCommissionPayment.findMany({
    where: { saleId },
    orderBy: { paymentDate: "desc" },
    include: {
      recordedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

/** Delete a recorded commission payment (corrects a mistaken entry). */
export async function deleteCommissionPayment(
  paymentId: string,
  performedBy?: string
): Promise<Sale> {
  const payment = await prisma.saleCommissionPayment.findUnique({
    where: { id: paymentId },
  });
  if (!payment) {
    throw new Error("Commission payment not found");
  }

  const sale = await prisma.sale.findUnique({ where: { id: payment.saleId } });
  if (!sale) {
    throw new Error("Sale not found");
  }

  const rawPaidAmount = sale.commissionPaidAmount.sub(payment.amount);
  const newPaidAmount = rawPaidAmount.lessThan(0)
    ? new Prisma.Decimal(0)
    : rawPaidAmount;

  await prisma.saleCommissionPayment.delete({ where: { id: paymentId } });

  const updatedSale = await prisma.sale.update({
    where: { id: sale.id },
    data: { commissionPaidAmount: newPaidAmount },
  });

  await createLog({
    action: "DELETE",
    entityType: "SaleCommissionPayment",
    entityId: paymentId,
    ...(performedBy && { performedBy }),
    oldData: payment,
    metadata: JSON.stringify({ saleId: sale.id }),
  });

  return updatedSale;
}

// --- Sale amount history ---

export async function getSaleAmountHistory(saleId: string) {
  return prisma.saleAmountHistory.findMany({
    where: { saleId },
    orderBy: { createdAt: "desc" },
    include: {
      changedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

// --- Commission summary (director-only Commissions page) ---

export type CommissionSummaryRow = {
  salesPerson: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    status: string;
  };
  saleCount: number;
  totalCommission: string;
  totalPaid: string;
  totalOutstanding: string;
};

export type CommissionSummary = {
  bySalesPerson: CommissionSummaryRow[];
  totals: {
    saleCount: number;
    totalCommission: string;
    totalPaid: string;
    totalOutstanding: string;
  };
};

/**
 * Aggregate commission earned/paid/outstanding per sales person, across all
 * non-cancelled sales that have a commission configured.
 */
export async function getCommissionSummary(): Promise<CommissionSummary> {
  const sales = await prisma.sale.findMany({
    where: {
      status: { not: "CANCELLED" },
      commissionSalesPersonId: { not: null },
    },
    select: {
      commissionSalesPersonId: true,
      commissionSalesPerson: {
        select: { id: true, name: true, phone: true, email: true, status: true },
      },
      commissionAmount: true,
      commissionPaidAmount: true,
    },
  });

  type Bucket = {
    salesPerson: CommissionSummaryRow["salesPerson"];
    saleCount: number;
    totalCommission: Prisma.Decimal;
    totalPaid: Prisma.Decimal;
  };

  const buckets = new Map<string, Bucket>();

  for (const s of sales) {
    if (!s.commissionSalesPersonId || !s.commissionSalesPerson) continue;
    const key = s.commissionSalesPersonId;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        salesPerson: s.commissionSalesPerson,
        saleCount: 0,
        totalCommission: new Prisma.Decimal(0),
        totalPaid: new Prisma.Decimal(0),
      };
      buckets.set(key, bucket);
    }
    bucket.saleCount += 1;
    bucket.totalCommission = bucket.totalCommission.add(s.commissionAmount);
    bucket.totalPaid = bucket.totalPaid.add(s.commissionPaidAmount);
  }

  const bySalesPerson: CommissionSummaryRow[] = [...buckets.values()]
    .map((b) => ({
      salesPerson: b.salesPerson,
      saleCount: b.saleCount,
      totalCommission: b.totalCommission.toString(),
      totalPaid: b.totalPaid.toString(),
      totalOutstanding: b.totalCommission.sub(b.totalPaid).toString(),
    }))
    .sort(
      (a, b) => Number(b.totalOutstanding) - Number(a.totalOutstanding)
    );

  const totals = bySalesPerson.reduce(
    (acc, row) => ({
      saleCount: acc.saleCount + row.saleCount,
      totalCommission: acc.totalCommission.add(new Prisma.Decimal(row.totalCommission)),
      totalPaid: acc.totalPaid.add(new Prisma.Decimal(row.totalPaid)),
    }),
    {
      saleCount: 0,
      totalCommission: new Prisma.Decimal(0),
      totalPaid: new Prisma.Decimal(0),
    }
  );

  return {
    bySalesPerson,
    totals: {
      saleCount: totals.saleCount,
      totalCommission: totals.totalCommission.toString(),
      totalPaid: totals.totalPaid.toString(),
      totalOutstanding: totals.totalCommission.sub(totals.totalPaid).toString(),
    },
  };
}

/** Sales (with commission info) credited to a specific sales person — for the Commissions page drill-down. */
export async function getSalesForSalesPerson(
  salesPersonId: string
): Promise<SaleWithRelations[]> {
  return prisma.sale.findMany({
    where: { commissionSalesPersonId: salesPersonId, status: { not: "CANCELLED" } },
    select: {
      id: true,
      saleNumber: true,
      clientId: true,
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
        },
      },
      saleDate: true,
      status: true,
      totalAmount: true,
      agreedMonthlyInstallmentAmount: true,
      paidAmount: true,
      completedAt: true,
      notes: true,
      requestedPaymentDateExtension: true,
      paymentExtensionDueDate: true,
      commissionSalesPersonId: true,
      commissionSalesPerson: {
        select: { id: true, name: true, phone: true, email: true, status: true },
      },
      commissionType: true,
      commissionRate: true,
      commissionAmount: true,
      commissionPaidAmount: true,
      items: {
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              sku: true,
              barcode: true,
            },
          },
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
        orderBy: { createdAt: "asc" },
      },
      installments: {
        select: {
          id: true,
          saleId: true,
          amount: true,
          dueDate: true,
          paidAt: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { paidAt: "asc" },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { saleDate: "desc" },
  });
}
