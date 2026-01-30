import { prisma } from "../lib/prisma.js";
import type { ProductCategory, Prisma } from "@prisma/client";
import { createLog } from "./systemLogService.js";

export type CreateProductCategoryData = Omit<
  Prisma.ProductCategoryCreateInput,
  "createdAt" | "updatedAt" | "products"
>;

export type UpdateProductCategoryData = Partial<
  Omit<
    Prisma.ProductCategoryUpdateInput,
    "createdAt" | "updatedAt" | "products"
  >
>;

export async function findAll(): Promise<ProductCategory[]> {
  return prisma.productCategory.findMany({
    where: {
      status: {
        not: "archived",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function findById(id: string): Promise<ProductCategory | null> {
  return prisma.productCategory.findUnique({
    where: { id },
  });
}

export async function findByName(
  name: string,
): Promise<ProductCategory | null> {
  return prisma.productCategory.findUnique({
    where: { name },
  });
}

export async function create(
  data: CreateProductCategoryData,
  performedBy?: string,
): Promise<ProductCategory> {
  const category = await prisma.productCategory.create({
    data,
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "ProductCategory",
    entityId: category.id,
    ...(performedBy && { performedBy }),
    newData: category,
  });

  return category;
}

export async function update(
  id: string,
  data: UpdateProductCategoryData,
  performedBy?: string,
): Promise<ProductCategory> {
  // Get old data for logging
  const oldCategory = await prisma.productCategory.findUnique({
    where: { id },
  });

  const category = await prisma.productCategory.update({
    where: { id },
    data,
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "ProductCategory",
    entityId: category.id,
    ...(performedBy && { performedBy }),
    oldData: oldCategory,
    newData: category,
  });

  return category;
}

export async function deleteProductCategory(
  id: string,
  performedBy?: string,
): Promise<ProductCategory> {
  // Get old data for logging
  const oldCategory = await prisma.productCategory.findUnique({
    where: { id },
  });

  if (!oldCategory) {
    throw new Error("Product category not found");
  }

  // Update category status to archived instead of deleting
  const category = await prisma.productCategory.update({
    where: { id },
    data: {
      status: "archived",
    },
  });

  // Log the deletion (archival)
  await createLog({
    action: "DELETE",
    entityType: "ProductCategory",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldCategory,
    newData: category,
  });

  return category;
}
