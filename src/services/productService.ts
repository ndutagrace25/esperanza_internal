import { prisma } from "../lib/prisma.js";
import type { Product, Prisma } from "@prisma/client";
import { createLog } from "./systemLogService.js";

export type CreateProductData = Omit<
  Prisma.ProductCreateInput,
  "category" | "createdAt" | "updatedAt"
> & {
  categoryId?: string | null;
};

export type UpdateProductData = Partial<
  Omit<Prisma.ProductUpdateInput, "category" | "createdAt" | "updatedAt">
> & {
  categoryId?: string | null;
};

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

type ProductWithRelations = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  category: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  stockQuantity: number | null;
  minStockLevel: number | null;
  unit: string | null;
  status: string;
  imageUrl: string | null;
  supplier: string | null;
  supplierContact: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<ProductWithRelations>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  // Get total count (excluding discontinued)
  const total = await prisma.product.count({
    where: {
      status: {
        not: "discontinued",
      },
    },
  });

  // Get paginated products (excluding discontinued)
  const products = await prisma.product.findMany({
    where: {
      status: {
        not: "discontinued",
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      sku: true,
      barcode: true,
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      stockQuantity: true,
      minStockLevel: true,
      unit: true,
      status: true,
      imageUrl: true,
      supplier: true,
      supplierContact: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: products,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function findById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
    },
  });
}

export async function findBySku(sku: string): Promise<Product | null> {
  return prisma.product.findUnique({
    where: { sku },
    include: {
      category: true,
    },
  });
}

export async function findByBarcode(
  barcode: string
): Promise<Product | null> {
  return prisma.product.findUnique({
    where: { barcode },
    include: {
      category: true,
    },
  });
}

export async function create(
  data: CreateProductData,
  performedBy?: string
): Promise<Product> {
  const { categoryId, ...productData } = data;

  const createData: Prisma.ProductCreateInput = {
    ...productData,
  };

  if (categoryId) {
    createData.category = {
      connect: { id: categoryId },
    };
  }

  const product = await prisma.product.create({
    data: createData,
    include: {
      category: true,
    },
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "Product",
    entityId: product.id,
    ...(performedBy && { performedBy }),
    newData: product,
  });

  return product;
}

export async function update(
  id: string,
  data: UpdateProductData,
  performedBy?: string
): Promise<Product> {
  // Get old data for logging
  const oldProduct = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });

  const { categoryId, ...productData } = data;

  const updateData: Prisma.ProductUpdateInput = {
    ...productData,
  };

  if (categoryId !== undefined) {
    if (categoryId === null) {
      updateData.category = {
        disconnect: true,
      };
    } else {
      updateData.category = {
        connect: { id: categoryId },
      };
    }
  }

  const product = await prisma.product.update({
    where: { id },
    data: updateData,
    include: {
      category: true,
    },
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "Product",
    entityId: product.id,
    ...(performedBy && { performedBy }),
    oldData: oldProduct,
    newData: product,
  });

  return product;
}

export async function deleteProduct(
  id: string,
  performedBy?: string
): Promise<Product> {
  // Get old data for logging
  const oldProduct = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!oldProduct) {
    throw new Error("Product not found");
  }

  // Update product status to discontinued instead of deleting
  const product = await prisma.product.update({
    where: { id },
    data: {
      status: "discontinued",
    },
    include: {
      category: true,
    },
  });

  // Log the deletion (discontinuation)
  await createLog({
    action: "DELETE",
    entityType: "Product",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldProduct,
    newData: product,
  });

  return product;
}

