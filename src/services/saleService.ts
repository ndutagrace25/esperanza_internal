import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import type { Sale } from "@prisma/client";
import { createLog } from "./systemLogService.js";

export type CreateSaleData = Omit<
  Prisma.SaleCreateInput,
  "client" | "items" | "createdAt" | "updatedAt" | "saleNumber" | "totalAmount"
> & {
  clientId: string;
  items?: Array<Omit<CreateSaleItemData, "saleId">>;
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
  notes: string | null;
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
      notes: true,
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
      notes: true,
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
      notes: true,
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
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function create(
  data: CreateSaleData,
  performedBy?: string
): Promise<Sale> {
  const { clientId, items, ...saleData } = data;

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
