import { prisma } from "../lib/prisma.js";
import type { ExpenseCategory } from "@prisma/client";

/**
 * Find all active expense categories
 */
export async function findAll(): Promise<ExpenseCategory[]> {
  return prisma.expenseCategory.findMany({
    where: {
      status: "active",
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Find expense category by ID
 */
export async function findById(id: string): Promise<ExpenseCategory | null> {
  return prisma.expenseCategory.findUnique({
    where: { id },
  });
}

/**
 * Find expense category by name
 */
export async function findByName(
  name: string,
): Promise<ExpenseCategory | null> {
  return prisma.expenseCategory.findUnique({
    where: { name },
  });
}

/**
 * Find the best matching category for a given job expense category string
 * Uses fuzzy matching to map free-text categories to formal categories
 */
export async function findMatchingCategory(
  categoryText: string,
): Promise<ExpenseCategory | null> {
  const lowerCategory = categoryText.toLowerCase();

  // Define mapping rules
  const mappings: Record<string, string[]> = {
    Transport: [
      "transport",
      "fuel",
      "taxi",
      "uber",
      "parking",
      "matatu",
      "bus",
      "fare",
    ],
    "Meals & Entertainment": [
      "meal",
      "lunch",
      "dinner",
      "breakfast",
      "food",
      "entertainment",
      "snack",
    ],
    "Office Supplies": [
      "stationery",
      "supplies",
      "office",
      "paper",
      "pen",
      "printing",
    ],
    Utilities: [
      "utility",
      "utilities",
      "electricity",
      "water",
      "internet",
      "wifi",
    ],
    Equipment: ["equipment", "hardware", "tool", "machine"],
    "Software & Subscriptions": ["software", "subscription", "license", "saas"],
    Communication: ["airtime", "data", "phone", "call", "sms", "bundle"],
    Accommodation: ["hotel", "lodging", "accommodation", "stay", "room"],
    "Repairs & Maintenance": ["repair", "maintenance", "fix", "service"],
    Miscellaneous: ["misc", "other", "miscellaneous"],
  };

  // Try to find a matching category
  for (const [categoryName, keywords] of Object.entries(mappings)) {
    for (const keyword of keywords) {
      if (lowerCategory.includes(keyword)) {
        const category = await findByName(categoryName);
        if (category) return category;
      }
    }
  }

  // Default to Miscellaneous if no match found
  return findByName("Miscellaneous");
}
