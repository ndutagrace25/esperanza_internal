import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import type { Sale } from "@prisma/client";
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
  "client" | "items" | "createdAt" | "updatedAt" | "saleNumber" | "totalAmount"
> & {
  clientId: string;
  items?: Array<Omit<CreateSaleItemData, "saleId">>;
  firstInstallment?: FirstInstallmentData;
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
  >
> & {
  clientId?: string;
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

export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<SaleWithRelations>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  // Get total count (excluding cancelled)
  const total = await prisma.sale.count({
    where: {
      status: {
        not: "CANCELLED",
      },
    },
  });

  // Get paginated sales (excluding cancelled)
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
  const { clientId, items, firstInstallment, ...saleData } = data;

  // Validate that items are provided
  if (!items || items.length === 0) {
    throw new Error("At least one sale item is required");
  }

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
  const { clientId, ...updateData } = data;

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

  // Build update data
  const saleUpdateData: Prisma.SaleUpdateInput = { ...updateData };

  if (clientId) {
    saleUpdateData.client = {
      connect: { id: clientId },
    };
  }

  // If items are being updated, recalculate totalAmount
  // Note: For simplicity, we'll require items to be updated separately via item endpoints
  // Recalculate from existing items
  const items = existingSale.items;
  if (items.length > 0) {
    saleUpdateData.totalAmount = calculateTotalAmount(items);
  }

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

  // Recalculate and update sale totalAmount
  const allItems = await prisma.saleItem.findMany({
    where: { saleId },
  });

  const newTotal = calculateTotalAmount(allItems);
  await prisma.sale.update({
    where: { id: saleId },
    data: { totalAmount: newTotal },
  });

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

  // Recalculate and update sale totalAmount
  const allItems = await prisma.saleItem.findMany({
    where: { saleId: existingItem.saleId },
  });

  const newTotal = calculateTotalAmount(allItems);
  await prisma.sale.update({
    where: { id: existingItem.saleId },
    data: { totalAmount: newTotal },
  });

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

  const saleId = existingItem.saleId;

  await prisma.saleItem.delete({
    where: { id },
  });

  // Recalculate and update sale totalAmount
  const allItems = await prisma.saleItem.findMany({
    where: { saleId },
  });

  const newTotal =
    allItems.length > 0
      ? calculateTotalAmount(allItems)
      : new Prisma.Decimal(0);
  await prisma.sale.update({
    where: { id: saleId },
    data: { totalAmount: newTotal },
  });

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
