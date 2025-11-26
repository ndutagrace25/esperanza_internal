import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

// Ensure DATABASE_URL is set in process.env for Prisma
if (!process.env["DATABASE_URL"]) {
  process.env["DATABASE_URL"] = env.DATABASE_URL;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
