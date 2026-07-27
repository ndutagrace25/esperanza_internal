import { prisma } from "../lib/prisma.js";
import type { Prisma, SalesPerson, SalesPersonStatus } from "@prisma/client";
import { createLog } from "./systemLogService.js";

export type CreateSalesPersonData = {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  employeeId?: string | null;
  status?: SalesPersonStatus;
};

export type UpdateSalesPersonData = Partial<CreateSalesPersonData>;

export type PaginationOptions = {
  page?: number;
  limit?: number;
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

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<SalesPerson & { employee: Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }> | null }>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const skip = (page - 1) * limit;

  const searchRaw = options.search?.trim();
  const where: Prisma.SalesPersonWhereInput = searchRaw
    ? {
        OR: [
          { name: { contains: searchRaw, mode: "insensitive" } },
          { email: { contains: searchRaw, mode: "insensitive" } },
          { phone: { contains: searchRaw, mode: "insensitive" } },
        ],
      }
    : {};

  const total = await prisma.salesPerson.count({ where });

  const data = await prisma.salesPerson.findMany({
    where,
    include: { employee: { select: employeeSelect } },
    orderBy: { name: "asc" },
    skip,
    take: limit,
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function findById(id: string) {
  return prisma.salesPerson.findUnique({
    where: { id },
    include: { employee: { select: employeeSelect } },
  });
}

export async function create(
  data: CreateSalesPersonData,
  performedBy?: string
): Promise<SalesPerson> {
  if (!data.name || !data.name.trim()) {
    throw new Error("Name is required");
  }

  const { employeeId, ...rest } = data;

  const createData: Prisma.SalesPersonCreateInput = {
    ...rest,
    name: data.name.trim(),
  };

  if (employeeId) {
    createData.employee = { connect: { id: employeeId } };
  }

  const salesPerson = await prisma.salesPerson.create({ data: createData });

  await createLog({
    action: "CREATE",
    entityType: "SalesPerson",
    entityId: salesPerson.id,
    ...(performedBy && { performedBy }),
    newData: salesPerson,
  });

  return salesPerson;
}

export async function update(
  id: string,
  data: UpdateSalesPersonData,
  performedBy?: string
): Promise<SalesPerson> {
  const existing = await prisma.salesPerson.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Sales person not found");
  }

  const { employeeId, name, ...rest } = data;

  const updateData: Prisma.SalesPersonUpdateInput = { ...rest };
  if (name !== undefined) {
    if (!name.trim()) {
      throw new Error("Name is required");
    }
    updateData.name = name.trim();
  }

  if (employeeId !== undefined) {
    updateData.employee =
      employeeId === null ? { disconnect: true } : { connect: { id: employeeId } };
  }

  const salesPerson = await prisma.salesPerson.update({
    where: { id },
    data: updateData,
  });

  await createLog({
    action: "UPDATE",
    entityType: "SalesPerson",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    newData: salesPerson,
  });

  return salesPerson;
}

/** Soft-delete: mark inactive rather than hard-delete, to preserve historical commission attribution. */
export async function deactivate(
  id: string,
  performedBy?: string
): Promise<SalesPerson> {
  return update(id, { status: "inactive" }, performedBy);
}
