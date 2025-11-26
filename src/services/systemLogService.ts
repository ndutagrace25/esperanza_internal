import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export type LogAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "OTHER";

export type CreateSystemLogData = {
  action: LogAction;
  entityType: string;
  entityId: string;
  performedBy?: string | undefined;
  oldData?: unknown | undefined;
  newData?: unknown | undefined;
  metadata?: unknown | undefined;
};

export async function createLog(data: CreateSystemLogData): Promise<void> {
  const logData: Prisma.SystemLogCreateInput = {
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    oldData: data.oldData ? JSON.stringify(data.oldData) : null,
    newData: data.newData ? JSON.stringify(data.newData) : null,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
  };

  if (data.performedBy) {
    logData.employee = {
      connect: { id: data.performedBy },
    };
  }

  await prisma.systemLog.create({
    data: logData,
  });
}

export async function findLogsByEntity(
  entityType: string,
  entityId: string
): Promise<Prisma.SystemLogGetPayload<{}>[]> {
  return prisma.systemLog.findMany({
    where: {
      entityType,
      entityId,
    },
    include: {
      employee: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function findLogsByEmployee(
  employeeId: string
): Promise<Prisma.SystemLogGetPayload<{}>[]> {
  return prisma.systemLog.findMany({
    where: {
      performedBy: employeeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function findLogsByAction(
  action: LogAction
): Promise<Prisma.SystemLogGetPayload<{}>[]> {
  return prisma.systemLog.findMany({
    where: {
      action,
    },
    include: {
      employee: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function findAllLogs(
  limit = 100
): Promise<Prisma.SystemLogGetPayload<{}>[]> {
  return prisma.systemLog.findMany({
    take: limit,
    include: {
      employee: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
