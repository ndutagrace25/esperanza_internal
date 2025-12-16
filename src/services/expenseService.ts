import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import type { Expense, ExpenseStatus, JobCardStatus } from "@prisma/client";
import { createLog } from "./systemLogService.js";
import { findMatchingCategory } from "./expenseCategoryService.js";
import { sendExpenseNotificationEmail } from "../utils/email.js";

// Types
export type CreateExpenseData = Omit<
  Prisma.ExpenseCreateInput,
  | "category"
  | "jobCard"
  | "jobExpense"
  | "submittedBy"
  | "approvedBy"
  | "createdAt"
  | "updatedAt"
  | "expenseNumber"
> & {
  categoryId: string;
  jobCardId?: string | null;
  jobExpenseId?: string | null;
  submittedById?: string | null;
  approvedById?: string | null;
};

export type UpdateExpenseData = Partial<
  Omit<
    Prisma.ExpenseUpdateInput,
    | "category"
    | "jobCard"
    | "jobExpense"
    | "submittedBy"
    | "approvedBy"
    | "createdAt"
    | "updatedAt"
    | "expenseNumber"
  >
> & {
  categoryId?: string;
  jobCardId?: string | null;
  jobExpenseId?: string | null;
  submittedById?: string | null;
  approvedById?: string | null;
};

export type CreateExpenseFromJobExpenseData = {
  jobExpenseId: string;
  jobCardId: string;
  category: string; // Free text from JobExpense
  description: string | null;
  amount: Prisma.Decimal | number | string;
  hasReceipt: boolean;
  receiptUrl: string | null;
  expenseDate: Date;
  submittedById: string | null;
  jobCardStatus: JobCardStatus;
};

export type PaginationOptions = {
  page?: number;
  limit?: number;
  status?: ExpenseStatus;
  categoryId?: string;
  jobCardId?: string;
  submittedById?: string;
  startDate?: Date;
  endDate?: Date;
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

type ExpenseWithRelations = {
  id: string;
  expenseNumber: string;
  categoryId: string;
  category: {
    id: string;
    name: string;
  };
  description: string;
  amount: Prisma.Decimal;
  expenseDate: Date;
  vendor: string | null;
  referenceNumber: string | null;
  paymentMethod: string | null;
  status: ExpenseStatus;
  hasReceipt: boolean;
  receiptUrl: string | null;
  notes: string | null;
  jobCardId: string | null;
  jobCard: {
    id: string;
    jobNumber: string;
    visitDate: Date;
    client: {
      id: string;
      companyName: string;
    };
  } | null;
  jobExpenseId: string | null;
  submittedById: string | null;
  submittedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  approvedById: string | null;
  approvedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Status mapping from JobCard to Expense
export function mapJobCardStatusToExpenseStatus(
  jobCardStatus: JobCardStatus
): ExpenseStatus {
  switch (jobCardStatus) {
    case "DRAFT":
      return "DRAFT";
    case "PENDING_CLIENT_CONFIRMATION":
    case "IN_PROGRESS":
      return "PENDING";
    case "COMPLETED":
      return "PAID";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

/**
 * Generate a unique expense number in the format EXP-YYYY-XXX
 */
async function generateExpenseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EXP-${year}-`;

  // Find the highest expense number for this year
  const lastExpense = await prisma.expense.findFirst({
    where: {
      expenseNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      expenseNumber: "desc",
    },
  });

  let sequence = 1;
  if (lastExpense) {
    // Extract the sequence number from the last expense number
    const lastSequence = parseInt(
      lastExpense.expenseNumber.replace(prefix, ""),
      10
    );
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  // Format with leading zeros (e.g., 001, 002, ..., 100)
  const sequenceStr = sequence.toString().padStart(3, "0");
  return `${prefix}${sequenceStr}`;
}

/**
 * Get email addresses of all active directors
 */
async function getDirectorEmails(): Promise<string[]> {
  const directors = await prisma.employee.findMany({
    where: {
      role: {
        name: "DIRECTOR",
      },
      status: "active",
    },
    select: {
      email: true,
    },
  });

  return directors.map((d) => d.email);
}

/**
 * Send expense notification email to directors (fire and forget)
 */
async function notifyDirectorsAboutExpense(
  expenseId: string,
  action: "created" | "updated"
): Promise<void> {
  try {
    // Fetch the expense with all needed relations
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        expenseNumber: true,
        description: true,
        amount: true,
        expenseDate: true,
        vendor: true,
        status: true,
        hasReceipt: true,
        category: {
          select: { name: true },
        },
        jobCard: {
          select: {
            jobNumber: true,
            client: {
              select: { companyName: true },
            },
          },
        },
        submittedBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!expense) {
      console.error(`Expense ${expenseId} not found for email notification`);
      return;
    }

    const directorEmails = await getDirectorEmails();

    if (directorEmails.length === 0) {
      console.log("No directors found to notify about expense");
      return;
    }

    await sendExpenseNotificationEmail(
      {
        ...expense,
        amount: Number(expense.amount),
      },
      directorEmails,
      action
    );

    console.log(
      `Expense ${action} notification sent to ${directorEmails.length} director(s)`
    );
  } catch (error) {
    // Log but don't throw - email failures shouldn't break the main flow
    console.error(`Failed to send expense ${action} notification:`, error);
  }
}

/**
 * Find all expenses with pagination and filters
 */
export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<ExpenseWithRelations>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.ExpenseWhereInput = {};

  if (options.status) {
    where.status = options.status;
  }
  if (options.categoryId) {
    where.categoryId = options.categoryId;
  }
  if (options.jobCardId) {
    where.jobCardId = options.jobCardId;
  }
  if (options.submittedById) {
    where.submittedById = options.submittedById;
  }
  if (options.startDate || options.endDate) {
    where.expenseDate = {};
    if (options.startDate) {
      where.expenseDate.gte = options.startDate;
    }
    if (options.endDate) {
      where.expenseDate.lte = options.endDate;
    }
  }

  // Search filter - searches across multiple fields
  if (options.search) {
    const searchTerm = options.search.trim();
    where.OR = [
      { expenseNumber: { contains: searchTerm, mode: "insensitive" } },
      { description: { contains: searchTerm, mode: "insensitive" } },
      { vendor: { contains: searchTerm, mode: "insensitive" } },
      { notes: { contains: searchTerm, mode: "insensitive" } },
      { referenceNumber: { contains: searchTerm, mode: "insensitive" } },
      { category: { name: { contains: searchTerm, mode: "insensitive" } } },
      {
        submittedBy: {
          OR: [
            { firstName: { contains: searchTerm, mode: "insensitive" } },
            { lastName: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
      },
      { jobCard: { jobNumber: { contains: searchTerm, mode: "insensitive" } } },
      {
        jobCard: {
          client: {
            companyName: { contains: searchTerm, mode: "insensitive" },
          },
        },
      },
    ];
  }

  // Get total count
  const total = await prisma.expense.count({ where });

  // Get paginated expenses
  const expenses = await prisma.expense.findMany({
    where,
    select: {
      id: true,
      expenseNumber: true,
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      description: true,
      amount: true,
      expenseDate: true,
      vendor: true,
      referenceNumber: true,
      paymentMethod: true,
      status: true,
      hasReceipt: true,
      receiptUrl: true,
      notes: true,
      jobCardId: true,
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          visitDate: true,
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      },
      jobExpenseId: true,
      submittedById: true,
      submittedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      approvedById: true,
      approvedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      approvedAt: true,
      rejectedAt: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      expenseDate: "desc",
    },
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: expenses,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Find expense by ID
 */
export async function findById(
  id: string
): Promise<ExpenseWithRelations | null> {
  return prisma.expense.findUnique({
    where: { id },
    select: {
      id: true,
      expenseNumber: true,
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      description: true,
      amount: true,
      expenseDate: true,
      vendor: true,
      referenceNumber: true,
      paymentMethod: true,
      status: true,
      hasReceipt: true,
      receiptUrl: true,
      notes: true,
      jobCardId: true,
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          visitDate: true,
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      },
      jobExpenseId: true,
      submittedById: true,
      submittedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      approvedById: true,
      approvedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      approvedAt: true,
      rejectedAt: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Find expense by expense number
 */
export async function findByExpenseNumber(
  expenseNumber: string
): Promise<ExpenseWithRelations | null> {
  return prisma.expense.findUnique({
    where: { expenseNumber },
    select: {
      id: true,
      expenseNumber: true,
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
        },
      },
      description: true,
      amount: true,
      expenseDate: true,
      vendor: true,
      referenceNumber: true,
      paymentMethod: true,
      status: true,
      hasReceipt: true,
      receiptUrl: true,
      notes: true,
      jobCardId: true,
      jobCard: {
        select: {
          id: true,
          jobNumber: true,
          visitDate: true,
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      },
      jobExpenseId: true,
      submittedById: true,
      submittedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      approvedById: true,
      approvedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      approvedAt: true,
      rejectedAt: true,
      rejectionReason: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Find expense by job expense ID
 */
export async function findByJobExpenseId(
  jobExpenseId: string
): Promise<Expense | null> {
  return prisma.expense.findUnique({
    where: { jobExpenseId },
  });
}

/**
 * Find all expenses linked to a job card
 */
export async function findByJobCardId(jobCardId: string): Promise<Expense[]> {
  return prisma.expense.findMany({
    where: { jobCardId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Create a new expense
 */
export async function create(
  data: CreateExpenseData,
  performedBy?: string
): Promise<Expense> {
  const {
    categoryId,
    jobCardId,
    jobExpenseId,
    submittedById,
    approvedById,
    ...expenseData
  } = data;

  // Generate unique expense number
  const expenseNumber = await generateExpenseNumber();

  const createData: Prisma.ExpenseCreateInput = {
    ...expenseData,
    expenseNumber,
    category: {
      connect: { id: categoryId },
    },
  };

  if (jobCardId) {
    createData.jobCard = { connect: { id: jobCardId } };
  }
  if (jobExpenseId) {
    createData.jobExpense = { connect: { id: jobExpenseId } };
  }
  if (submittedById) {
    createData.submittedBy = { connect: { id: submittedById } };
  }
  if (approvedById) {
    createData.approvedBy = { connect: { id: approvedById } };
  }

  const expense = await prisma.expense.create({
    data: createData,
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "Expense",
    entityId: expense.id,
    ...(performedBy && { performedBy }),
    newData: expense,
  });

  // Send notification to directors (fire and forget)
  notifyDirectorsAboutExpense(expense.id, "created");

  return expense;
}

/**
 * Create expense from a JobExpense record (used for syncing)
 */
export async function createFromJobExpense(
  data: CreateExpenseFromJobExpenseData,
  performedBy?: string
): Promise<Expense> {
  // Find matching category
  const category = await findMatchingCategory(data.category);
  if (!category) {
    throw new Error(`No matching expense category found for: ${data.category}`);
  }

  // Map job card status to expense status
  const expenseStatus = mapJobCardStatusToExpenseStatus(data.jobCardStatus);

  // Generate expense number
  const expenseNumber = await generateExpenseNumber();

  const createData: Prisma.ExpenseCreateInput = {
    expenseNumber,
    category: { connect: { id: category.id } },
    description: data.description || data.category,
    amount: data.amount,
    expenseDate: data.expenseDate,
    status: expenseStatus,
    hasReceipt: data.hasReceipt,
    receiptUrl: data.receiptUrl,
    notes: `Auto-created from Job Card expense`,
    jobCard: { connect: { id: data.jobCardId } },
    jobExpense: { connect: { id: data.jobExpenseId } },
  };

  if (data.submittedById) {
    createData.submittedBy = { connect: { id: data.submittedById } };
  }

  // If completed, set approval info
  if (expenseStatus === "PAID" && data.submittedById) {
    createData.approvedBy = { connect: { id: data.submittedById } };
    createData.approvedAt = new Date();
  }

  const expense = await prisma.expense.create({
    data: createData,
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "Expense",
    entityId: expense.id,
    ...(performedBy && { performedBy }),
    newData: expense,
    metadata: JSON.stringify({
      source: "JobExpense",
      jobExpenseId: data.jobExpenseId,
      jobCardId: data.jobCardId,
    }),
  });

  return expense;
}

/**
 * Map expense status to job card status
 */
export function mapExpenseStatusToJobCardStatus(
  expenseStatus: ExpenseStatus
): JobCardStatus | null {
  switch (expenseStatus) {
    case "PAID":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      // For DRAFT, PENDING, APPROVED, REJECTED - don't change job card status
      return null;
  }
}

/**
 * Sync linked JobExpense when Expense data changes
 */
async function syncJobExpenseFromExpense(
  expense: Expense,
  data: UpdateExpenseData,
  performedBy?: string
): Promise<void> {
  if (!expense.jobExpenseId) return;

  // Build update data for JobExpense
  const jobExpenseUpdate: Prisma.JobExpenseUpdateInput = {};
  let hasChanges = false;

  if (data.amount !== undefined) {
    jobExpenseUpdate.amount = data.amount as Prisma.Decimal;
    hasChanges = true;
  }
  if (data.hasReceipt !== undefined) {
    jobExpenseUpdate.hasReceipt = data.hasReceipt as boolean;
    hasChanges = true;
  }
  if (data.receiptUrl !== undefined) {
    jobExpenseUpdate.receiptUrl = data.receiptUrl as string | null;
    hasChanges = true;
  }
  if (data.description !== undefined) {
    jobExpenseUpdate.description = data.description as string | null;
    hasChanges = true;
  }

  if (hasChanges) {
    const oldJobExpense = await prisma.jobExpense.findUnique({
      where: { id: expense.jobExpenseId },
    });

    await prisma.jobExpense.update({
      where: { id: expense.jobExpenseId },
      data: jobExpenseUpdate,
    });

    // Log the sync
    await createLog({
      action: "UPDATE",
      entityType: "JobExpense",
      entityId: expense.jobExpenseId,
      ...(performedBy && { performedBy }),
      oldData: oldJobExpense,
      newData: { ...oldJobExpense, ...jobExpenseUpdate },
      metadata: JSON.stringify({
        source: "ExpenseSync",
        expenseId: expense.id,
      }),
    });
  }
}

/**
 * Sync JobCard status when Expense status changes
 */
async function syncJobCardFromExpenseStatus(
  expense: Expense,
  newStatus: ExpenseStatus,
  oldStatus: ExpenseStatus | undefined,
  performedBy?: string
): Promise<void> {
  if (!expense.jobCardId) return;
  if (newStatus === oldStatus) return;

  const targetJobCardStatus = mapExpenseStatusToJobCardStatus(newStatus);
  if (!targetJobCardStatus) return;

  // Get the current job card
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: expense.jobCardId },
  });

  if (!jobCard) return;

  // Don't update if job card is already in a terminal state (unless cancelling)
  const terminalStates: JobCardStatus[] = ["COMPLETED", "CANCELLED"];
  if (
    terminalStates.includes(jobCard.status) &&
    targetJobCardStatus !== "CANCELLED"
  ) {
    return;
  }

  // For COMPLETED status, check if ALL expenses for this job card are PAID
  if (targetJobCardStatus === "COMPLETED") {
    const allExpenses = await prisma.expense.findMany({
      where: { jobCardId: expense.jobCardId },
    });

    // Check if all expenses are now PAID
    const allPaid = allExpenses.every((exp) =>
      exp.id === expense.id ? newStatus === "PAID" : exp.status === "PAID"
    );

    if (!allPaid) {
      // Not all expenses are paid yet, don't complete the job card
      return;
    }
  }

  // For CANCELLED status, only cancel job card if ALL expenses are cancelled
  if (targetJobCardStatus === "CANCELLED") {
    const allExpenses = await prisma.expense.findMany({
      where: { jobCardId: expense.jobCardId },
    });

    const allCancelled = allExpenses.every((exp) =>
      exp.id === expense.id
        ? newStatus === "CANCELLED"
        : exp.status === "CANCELLED"
    );

    if (!allCancelled) {
      // Not all expenses are cancelled, don't cancel the job card
      return;
    }
  }

  // Update the job card status
  const oldJobCard = { ...jobCard };
  const updatedJobCard = await prisma.jobCard.update({
    where: { id: expense.jobCardId },
    data: {
      status: targetJobCardStatus,
      ...(targetJobCardStatus === "COMPLETED" && { completedAt: new Date() }),
      ...(targetJobCardStatus === "CANCELLED" && { cancelledAt: new Date() }),
    },
  });

  // Log the sync
  await createLog({
    action: "UPDATE",
    entityType: "JobCard",
    entityId: expense.jobCardId,
    ...(performedBy && { performedBy }),
    oldData: oldJobCard,
    newData: updatedJobCard,
    metadata: JSON.stringify({
      source: "ExpenseStatusSync",
      expenseId: expense.id,
      expenseStatus: newStatus,
    }),
  });
}

/**
 * Update an expense
 */
export async function update(
  id: string,
  data: UpdateExpenseData,
  performedBy?: string
): Promise<Expense> {
  // Get old data for logging
  const oldExpense = await prisma.expense.findUnique({
    where: { id },
  });

  const {
    categoryId,
    jobCardId,
    jobExpenseId,
    submittedById,
    approvedById,
    ...expenseData
  } = data;

  const updateData: Prisma.ExpenseUpdateInput = {
    ...expenseData,
  };

  if (categoryId !== undefined) {
    updateData.category = { connect: { id: categoryId } };
  }
  if (jobCardId !== undefined) {
    if (jobCardId === null) {
      updateData.jobCard = { disconnect: true };
    } else {
      updateData.jobCard = { connect: { id: jobCardId } };
    }
  }
  if (jobExpenseId !== undefined) {
    if (jobExpenseId === null) {
      updateData.jobExpense = { disconnect: true };
    } else {
      updateData.jobExpense = { connect: { id: jobExpenseId } };
    }
  }
  if (submittedById !== undefined) {
    if (submittedById === null) {
      updateData.submittedBy = { disconnect: true };
    } else {
      updateData.submittedBy = { connect: { id: submittedById } };
    }
  }
  if (approvedById !== undefined) {
    if (approvedById === null) {
      updateData.approvedBy = { disconnect: true };
    } else {
      updateData.approvedBy = { connect: { id: approvedById } };
    }
  }

  // Handle status-based timestamps
  if (data.status === "APPROVED" && !oldExpense?.approvedAt) {
    updateData.approvedAt = new Date();
  } else if (data.status === "REJECTED" && !oldExpense?.rejectedAt) {
    updateData.rejectedAt = new Date();
  }

  const expense = await prisma.expense.update({
    where: { id },
    data: updateData,
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "Expense",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldExpense,
    newData: expense,
  });

  // Sync linked JobExpense if data fields changed
  if (oldExpense?.jobExpenseId) {
    await syncJobExpenseFromExpense(expense, data, performedBy);
  }

  // Sync JobCard status if expense status changed
  if (data.status && expense.jobCardId) {
    await syncJobCardFromExpenseStatus(
      expense,
      data.status as ExpenseStatus,
      oldExpense?.status,
      performedBy
    );
  }

  // Send notification to directors (fire and forget)
  notifyDirectorsAboutExpense(expense.id, "updated");

  return expense;
}

/**
 * Update expense status (convenience method)
 */
export async function updateStatus(
  id: string,
  status: ExpenseStatus,
  performedBy?: string,
  additionalData?: {
    approvedById?: string;
    rejectionReason?: string;
  }
): Promise<Expense> {
  const updateData: UpdateExpenseData = { status };

  if (status === "APPROVED" || status === "PAID") {
    if (additionalData?.approvedById) {
      updateData.approvedById = additionalData.approvedById;
    }
    updateData.approvedAt = new Date();
  } else if (status === "REJECTED") {
    updateData.rejectedAt = new Date();
    if (additionalData?.rejectionReason) {
      updateData.rejectionReason = additionalData.rejectionReason;
    }
  }

  return update(id, updateData, performedBy);
}

/**
 * Update all expenses linked to a job card when job card status changes
 */
export async function syncExpensesWithJobCardStatus(
  jobCardId: string,
  newJobCardStatus: JobCardStatus,
  performedBy?: string
): Promise<void> {
  const newExpenseStatus = mapJobCardStatusToExpenseStatus(newJobCardStatus);

  // Find all expenses linked to this job card
  const expenses = await findByJobCardId(jobCardId);

  for (const expense of expenses) {
    // Only update if the expense is not already in a terminal state
    // (Don't revert PAID back to PENDING, etc.)
    const terminalStates: ExpenseStatus[] = ["PAID", "REJECTED", "CANCELLED"];
    if (!terminalStates.includes(expense.status)) {
      await updateStatus(
        expense.id,
        newExpenseStatus,
        performedBy,
        performedBy ? { approvedById: performedBy } : undefined
      );
    } else if (newJobCardStatus === "CANCELLED") {
      // If job card is cancelled, cancel all expenses regardless
      await updateStatus(expense.id, "CANCELLED", performedBy);
    }
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(
  id: string,
  performedBy?: string
): Promise<Expense> {
  // Get old data for logging
  const oldExpense = await prisma.expense.findUnique({
    where: { id },
  });

  if (!oldExpense) {
    throw new Error("Expense not found");
  }

  const expense = await prisma.expense.delete({
    where: { id },
  });

  // Log the deletion
  await createLog({
    action: "DELETE",
    entityType: "Expense",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldExpense,
  });

  return expense;
}

/**
 * Delete expense by job expense ID (used when deleting a JobExpense)
 */
export async function deleteByJobExpenseId(
  jobExpenseId: string,
  performedBy?: string
): Promise<Expense | null> {
  const expense = await findByJobExpenseId(jobExpenseId);
  if (!expense) {
    return null;
  }
  return deleteExpense(expense.id, performedBy);
}

/**
 * Approve an expense
 */
export async function approve(
  id: string,
  approvedById: string,
  performedBy?: string
): Promise<Expense> {
  return updateStatus(id, "APPROVED", performedBy, { approvedById });
}

/**
 * Mark expense as paid
 */
export async function markAsPaid(
  id: string,
  approvedById: string,
  performedBy?: string
): Promise<Expense> {
  return updateStatus(id, "PAID", performedBy, { approvedById });
}

/**
 * Reject an expense
 */
export async function reject(
  id: string,
  rejectionReason: string,
  performedBy?: string
): Promise<Expense> {
  return updateStatus(id, "REJECTED", performedBy, { rejectionReason });
}

/**
 * Cancel an expense
 */
export async function cancel(
  id: string,
  performedBy?: string
): Promise<Expense> {
  return updateStatus(id, "CANCELLED", performedBy);
}
