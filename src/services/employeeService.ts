import { prisma } from "../lib/prisma.js";
import type { Employee, Prisma } from "@prisma/client";
import { createLog } from "./systemLogService.js";
import { generateTempPassword, hashPassword } from "../utils/password.js";

export type CreateEmployeeData = Omit<
  Prisma.EmployeeCreateInput,
  "role" | "createdAt" | "updatedAt" | "password" | "tempPassword"
> & {
  roleId?: string;
  password?: string; // Optional, will be generated if not provided
};

export type UpdateEmployeeData = Partial<
  Omit<Prisma.EmployeeUpdateInput, "role" | "createdAt" | "updatedAt">
> & {
  roleId?: string;
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

type EmployeeWithoutPassword = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string | null;
  department: string | null;
  phone: string | null;
  roleId: string | null;
  role: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  status: string;
  hireDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<EmployeeWithoutPassword>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  // Get total count (excluding terminated)
  const total = await prisma.employee.count({
    where: {
      status: {
        not: "terminated",
      },
    },
  });

  // Get paginated employees (excluding terminated by default)
  const employees = await prisma.employee.findMany({
    where: {
      status: {
        not: "terminated",
      },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      position: true,
      department: true,
      phone: true,
      roleId: true,
      role: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      status: true,
      hireDate: true,
      createdAt: true,
      updatedAt: true,
      // Exclude password and tempPassword
    },
    orderBy: {
      createdAt: "desc",
    },
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: employees,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function findById(id: string) {
  return prisma.employee.findUnique({
    where: { id },
    include: {
      role: true,
    },
  });
}

export async function findByEmail(email: string): Promise<Employee | null> {
  return prisma.employee.findUnique({
    where: { email },
    include: {
      role: true,
    },
  });
}

export async function create(
  data: CreateEmployeeData,
  performedBy?: string
): Promise<Employee> {
  const { roleId, password, ...employeeData } = data;

  // Generate random tempPassword if not provided
  const tempPassword = password || generateTempPassword();

  // Hash the password
  const hashedPassword = await hashPassword(tempPassword);

  // Set expiration date (7 days from now)
  const tempPasswordExpiresAt = new Date();
  tempPasswordExpiresAt.setDate(tempPasswordExpiresAt.getDate() + 7);

  const createData: Prisma.EmployeeCreateInput = {
    ...employeeData,
    password: hashedPassword,
    tempPassword: tempPassword,
    tempPasswordExpiresAt: tempPasswordExpiresAt,
  };

  if (roleId) {
    createData.role = {
      connect: { id: roleId },
    };
  }

  const employee = await prisma.employee.create({
    data: createData,
    include: {
      role: true,
    },
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "Employee",
    entityId: employee.id,
    ...(performedBy && { performedBy }),
    newData: employee,
  });

  return employee;
}

export async function update(
  id: string,
  data: UpdateEmployeeData,
  performedBy?: string
): Promise<Employee> {
  // Get old data for logging
  const oldEmployee = await prisma.employee.findUnique({
    where: { id },
    include: { role: true },
  });

  const { roleId, ...employeeData } = data;

  const updateData: Prisma.EmployeeUpdateInput = {
    ...employeeData,
  };

  if (roleId !== undefined) {
    if (roleId === null) {
      updateData.role = {
        disconnect: true,
      };
    } else {
      updateData.role = {
        connect: { id: roleId },
      };
    }
  }

  const employee = await prisma.employee.update({
    where: { id },
    data: updateData,
    include: {
      role: true,
    },
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "Employee",
    entityId: employee.id,
    ...(performedBy && { performedBy }),
    oldData: oldEmployee,
    newData: employee,
  });

  return employee;
}

export async function deleteEmployee(
  id: string,
  performedBy?: string
): Promise<Employee> {
  // Get old data for logging
  const oldEmployee = await prisma.employee.findUnique({
    where: { id },
    include: { role: true },
  });

  if (!oldEmployee) {
    throw new Error("Employee not found");
  }

  // Update employee status to terminated instead of deleting
  const employee = await prisma.employee.update({
    where: { id },
    data: {
      status: "terminated",
    },
    include: {
      role: true,
    },
  });

  // Log the termination (still using DELETE action for business logic)
  await createLog({
    action: "DELETE",
    entityType: "Employee",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldEmployee,
    newData: employee,
  });

  return employee;
}
