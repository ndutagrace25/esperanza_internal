import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";

export async function findAll(): Promise<Role[]> {
  return prisma.role.findMany({
    orderBy: {
      name: "asc",
    },
  });
}

export async function findById(id: string): Promise<Role | null> {
  return prisma.role.findUnique({
    where: { id },
  });
}

export async function findByName(name: string): Promise<Role | null> {
  return prisma.role.findUnique({
    where: { name },
  });
}
