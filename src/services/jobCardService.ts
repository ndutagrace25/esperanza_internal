import { prisma } from "../lib/prisma.js";
import type { JobCard, Prisma, JobCardStatus } from "@prisma/client";
import { createLog } from "./systemLogService.js";
import { sendJobCardNotificationEmail } from "../utils/email.js";
import * as expenseService from "./expenseService.js";

export type CreateJobCardData = Omit<
  Prisma.JobCardCreateInput,
  | "client"
  | "supportStaff"
  | "tasks"
  | "expenses"
  | "approvals"
  | "createdAt"
  | "updatedAt"
  | "jobNumber"
> & {
  clientId: string;
  supportStaffId?: string | null;
  tasks?: Array<Omit<CreateJobTaskData, "jobCardId">>;
  expenses?: Array<Omit<CreateJobExpenseData, "jobCardId">>;
};

export type UpdateJobCardData = Partial<
  Omit<
    Prisma.JobCardUpdateInput,
    | "client"
    | "supportStaff"
    | "tasks"
    | "expenses"
    | "approvals"
    | "createdAt"
    | "updatedAt"
    | "jobNumber"
  >
> & {
  clientId?: string;
  supportStaffId?: string | null;
};

export type CreateJobTaskData = Omit<
  Prisma.JobTaskCreateInput,
  "jobCard" | "createdAt" | "updatedAt"
> & {
  jobCardId: string;
};

export type UpdateJobTaskData = Partial<
  Omit<Prisma.JobTaskUpdateInput, "jobCard" | "createdAt" | "updatedAt">
>;

export type CreateJobExpenseData = Omit<
  Prisma.JobExpenseCreateInput,
  "jobCard" | "createdAt" | "updatedAt"
> & {
  jobCardId: string;
};

export type UpdateJobExpenseData = Partial<
  Omit<Prisma.JobExpenseUpdateInput, "jobCard" | "createdAt" | "updatedAt">
>;

export type CreateJobCardApprovalData = Omit<
  Prisma.JobCardApprovalCreateInput,
  "jobCard" | "createdAt" | "updatedAt"
> & {
  jobCardId: string;
};

export type UpdateJobCardApprovalData = Partial<
  Omit<Prisma.JobCardApprovalUpdateInput, "jobCard" | "createdAt" | "updatedAt">
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

type JobCardWithRelations = {
  id: string;
  jobNumber: string;
  visitDate: Date;
  clientId: string;
  client: {
    id: string;
    companyName: string;
    contactPerson: string | null;
    email: string | null;
    phone: string | null;
  };
  location: string | null;
  contactPerson: string | null;
  purpose: string | null;
  estimatedDuration: number | null;
  estimatedCost: Prisma.Decimal | null;
  startTime: Date | null;
  endTime: Date | null;
  workSummary: string | null;
  findings: string | null;
  recommendations: string | null;
  status: string;
  completedAt: Date | null;
  cancelledAt: Date | null;
  supportStaffId: string | null;
  supportStaff: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  tasks: Array<{
    id: string;
    moduleName: string | null;
    taskType: string | null;
    description: string;
    startTime: Date | null;
    endTime: Date | null;
  }>;
  expenses: Array<{
    id: string;
    category: string;
    description: string | null;
    amount: Prisma.Decimal;
    hasReceipt: boolean;
    receiptUrl: string | null;
  }>;
  approvals: Array<{
    id: string;
    role: string;
    approverName: string | null;
    approverTitle: string | null;
    comment: string | null;
    signedAt: Date | null;
    signatureType: string | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Generate a unique job number in the format JC-YYYY-XXX
 */
async function generateJobNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `JC-${year}-`;

  // Find the highest job number for this year
  const lastJobCard = await prisma.jobCard.findFirst({
    where: {
      jobNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      jobNumber: "desc",
    },
  });

  let sequence = 1;
  if (lastJobCard) {
    // Extract the sequence number from the last job number
    const lastSequence = parseInt(
      lastJobCard.jobNumber.replace(prefix, ""),
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

export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<JobCardWithRelations>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  // Get total count
  const total = await prisma.jobCard.count();

  // Get paginated job cards
  const jobCards = await prisma.jobCard.findMany({
    select: {
      id: true,
      jobNumber: true,
      visitDate: true,
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
      location: true,
      contactPerson: true,
      purpose: true,
      estimatedDuration: true,
      estimatedCost: true,
      startTime: true,
      endTime: true,
      workSummary: true,
      findings: true,
      recommendations: true,
      status: true,
      completedAt: true,
      cancelledAt: true,
      supportStaffId: true,
      supportStaff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      tasks: {
        select: {
          id: true,
          moduleName: true,
          taskType: true,
          description: true,
          startTime: true,
          endTime: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      expenses: {
        select: {
          id: true,
          category: true,
          description: true,
          amount: true,
          hasReceipt: true,
          receiptUrl: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      approvals: {
        select: {
          id: true,
          role: true,
          approverName: true,
          approverTitle: true,
          comment: true,
          signedAt: true,
          signatureType: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      visitDate: "desc",
    },
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: jobCards,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function findById(id: string) {
  return prisma.jobCard.findUnique({
    where: { id },
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
      supportStaff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      tasks: {
        orderBy: {
          createdAt: "asc",
        },
      },
      expenses: {
        orderBy: {
          createdAt: "asc",
        },
      },
      approvals: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function findByJobNumber(jobNumber: string) {
  return prisma.jobCard.findUnique({
    where: { jobNumber },
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
      supportStaff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      tasks: {
        orderBy: {
          createdAt: "asc",
        },
      },
      expenses: {
        orderBy: {
          createdAt: "asc",
        },
      },
      approvals: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

export async function create(
  data: CreateJobCardData,
  performedBy?: string
): Promise<JobCard> {
  const { clientId, supportStaffId, tasks, expenses, ...jobCardData } = data;

  // Generate unique job number
  const jobNumber = await generateJobNumber();

  const createData: Prisma.JobCardCreateInput = {
    ...jobCardData,
    jobNumber,
    client: {
      connect: { id: clientId },
    },
  };

  if (supportStaffId) {
    createData.supportStaff = {
      connect: { id: supportStaffId },
    };
  }

  // Add tasks if provided
  if (tasks && tasks.length > 0) {
    createData.tasks = {
      create: tasks.map((task) => ({
        moduleName: task.moduleName ?? null,
        taskType: task.taskType ?? null,
        description: task.description,
        startTime: task.startTime ?? null,
        endTime: task.endTime ?? null,
      })),
    };
  }

  // Add expenses if provided
  if (expenses && expenses.length > 0) {
    createData.expenses = {
      create: expenses.map((expense) => ({
        category: expense.category,
        description: expense.description ?? null,
        amount: expense.amount,
        hasReceipt: expense.hasReceipt ?? false,
        receiptUrl: expense.receiptUrl ?? null,
      })),
    };
  }

  const jobCard = await prisma.jobCard.create({
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
      supportStaff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      tasks: {
        select: {
          id: true,
          moduleName: true,
          taskType: true,
          description: true,
          startTime: true,
          endTime: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      expenses: {
        select: {
          id: true,
          category: true,
          description: true,
          amount: true,
          hasReceipt: true,
          receiptUrl: true,
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
    entityType: "JobCard",
    entityId: jobCard.id,
    ...(performedBy && { performedBy }),
    newData: jobCard,
  });

  // Log task creations
  if (jobCard.tasks.length > 0) {
    for (const task of jobCard.tasks) {
      await createLog({
        action: "CREATE",
        entityType: "JobTask",
        entityId: task.id,
        ...(performedBy && { performedBy }),
        newData: task,
        metadata: JSON.stringify({ jobCardId: jobCard.id }),
      });
    }
  }

  // Log expense creations and sync to formal Expense module
  if (jobCard.expenses.length > 0) {
    for (const expense of jobCard.expenses) {
      await createLog({
        action: "CREATE",
        entityType: "JobExpense",
        entityId: expense.id,
        ...(performedBy && { performedBy }),
        newData: expense,
        metadata: JSON.stringify({ jobCardId: jobCard.id }),
      });

      // Create formal Expense record linked to this JobExpense
      try {
        await expenseService.createFromJobExpense(
          {
            jobExpenseId: expense.id,
            jobCardId: jobCard.id,
            category: expense.category,
            description: expense.description,
            amount: expense.amount,
            hasReceipt: expense.hasReceipt,
            receiptUrl: expense.receiptUrl,
            expenseDate: jobCard.visitDate,
            submittedById: jobCard.supportStaffId,
            jobCardStatus: jobCard.status as JobCardStatus,
          },
          performedBy
        );
      } catch (error) {
        console.error(
          `Failed to create formal expense for JobExpense ${expense.id}:`,
          error
        );
      }
    }
  }

  // Send email notification to directors after successful creation
  try {
    // Get all directors
    const directors = await prisma.employee.findMany({
      where: {
        status: "active",
        role: {
          name: "DIRECTOR",
        },
      },
      select: {
        email: true,
      },
    });

    const directorEmails = directors
      .map((director) => director.email)
      .filter((email): email is string => email !== null);

    // Only send email if there's at least one task or expense
    if (
      directorEmails.length > 0 &&
      (jobCard.tasks.length > 0 || jobCard.expenses.length > 0)
    ) {
      await sendJobCardNotificationEmail(
        {
          jobNumber: jobCard.jobNumber,
          visitDate: jobCard.visitDate,
          client: jobCard.client,
          supportStaff: jobCard.supportStaff,
          tasks: jobCard.tasks.map((task) => ({
            moduleName: task.moduleName,
            taskType: task.taskType,
            description: task.description,
            startTime: task.startTime,
            endTime: task.endTime,
          })),
          expenses: jobCard.expenses.map((expense) => ({
            category: expense.category,
            description: expense.description,
            amount: Number(expense.amount),
            hasReceipt: expense.hasReceipt,
          })),
        },
        directorEmails
      );
    }
  } catch (error) {
    // Log error but don't fail the job card creation
    console.error("Failed to send job card notification email:", error);
  }

  return jobCard;
}

export async function update(
  id: string,
  data: UpdateJobCardData,
  performedBy?: string
): Promise<JobCard> {
  // Get old data for logging
  const oldJobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      client: true,
      supportStaff: true,
      tasks: true,
      expenses: true,
      approvals: true,
    },
  });

  const { clientId, supportStaffId, ...jobCardData } = data;

  const updateData: Prisma.JobCardUpdateInput = {
    ...jobCardData,
  };

  if (clientId !== undefined) {
    updateData.client = {
      connect: { id: clientId },
    };
  }

  if (supportStaffId !== undefined) {
    if (supportStaffId === null) {
      updateData.supportStaff = {
        disconnect: true,
      };
    } else {
      updateData.supportStaff = {
        connect: { id: supportStaffId },
      };
    }
  }

  // Handle status-based timestamps
  if (data.status === "COMPLETED" && !oldJobCard?.completedAt) {
    updateData.completedAt = new Date();
  } else if (data.status === "CANCELLED" && !oldJobCard?.cancelledAt) {
    updateData.cancelledAt = new Date();
  }

  const jobCard = await prisma.jobCard.update({
    where: { id },
    data: updateData,
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
      supportStaff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      tasks: {
        orderBy: {
          createdAt: "asc",
        },
      },
      expenses: {
        orderBy: {
          createdAt: "asc",
        },
      },
      approvals: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "JobCard",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldJobCard,
    newData: jobCard,
  });

  // Sync expense statuses if job card status changed
  if (data.status && oldJobCard?.status !== data.status) {
    try {
      await expenseService.syncExpensesWithJobCardStatus(
        id,
        data.status as JobCardStatus,
        performedBy
      );
    } catch (error) {
      console.error(
        `Failed to sync expenses for job card ${id} status change:`,
        error
      );
    }
  }

  return jobCard;
}

export async function deleteJobCard(
  id: string,
  performedBy?: string
): Promise<JobCard> {
  // Get old data for logging
  const oldJobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      client: true,
      supportStaff: true,
      tasks: true,
      expenses: true,
      approvals: true,
    },
  });

  if (!oldJobCard) {
    throw new Error("Job card not found");
  }

  // Delete linked formal Expenses first (due to foreign key constraints)
  // These are expenses that reference this job card
  try {
    const linkedExpenses = await expenseService.findByJobCardId(id);
    for (const expense of linkedExpenses) {
      await expenseService.deleteExpense(expense.id, performedBy);
    }
  } catch (error) {
    console.error(
      `Failed to delete linked formal expenses for JobCard ${id}:`,
      error
    );
  }

  // Delete the job card (cascades to tasks, JobExpenses, approvals)
  const jobCard = await prisma.jobCard.delete({
    where: { id },
  });

  // Log the deletion
  await createLog({
    action: "DELETE",
    entityType: "JobCard",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldJobCard,
  });

  return jobCard;
}

// JobTask operations
export async function createTask(
  data: CreateJobTaskData,
  performedBy?: string
) {
  const { jobCardId, ...taskData } = data;

  const task = await prisma.jobTask.create({
    data: {
      ...taskData,
      jobCard: {
        connect: { id: jobCardId },
      },
    },
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "JobTask",
    entityId: task.id,
    ...(performedBy && { performedBy }),
    newData: task,
    metadata: JSON.stringify({ jobCardId }),
  });

  return task;
}

export async function updateTask(
  id: string,
  data: UpdateJobTaskData,
  performedBy?: string
) {
  const oldTask = await prisma.jobTask.findUnique({
    where: { id },
  });

  const task = await prisma.jobTask.update({
    where: { id },
    data,
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "JobTask",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldTask,
    newData: task,
  });

  return task;
}

export async function deleteTask(id: string, performedBy?: string) {
  const oldTask = await prisma.jobTask.findUnique({
    where: { id },
  });

  const task = await prisma.jobTask.delete({
    where: { id },
  });

  // Log the deletion
  await createLog({
    action: "DELETE",
    entityType: "JobTask",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldTask,
  });

  return task;
}

// JobExpense operations
export async function createExpense(
  data: CreateJobExpenseData,
  performedBy?: string
) {
  const { jobCardId, ...expenseData } = data;

  const expense = await prisma.jobExpense.create({
    data: {
      ...expenseData,
      jobCard: {
        connect: { id: jobCardId },
      },
    },
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "JobExpense",
    entityId: expense.id,
    ...(performedBy && { performedBy }),
    newData: expense,
    metadata: JSON.stringify({ jobCardId }),
  });

  // Create formal Expense record linked to this JobExpense
  try {
    const jobCard = await prisma.jobCard.findUnique({
      where: { id: jobCardId },
      select: {
        id: true,
        visitDate: true,
        status: true,
        supportStaffId: true,
      },
    });

    if (jobCard) {
      await expenseService.createFromJobExpense(
        {
          jobExpenseId: expense.id,
          jobCardId: jobCard.id,
          category: expense.category,
          description: expense.description,
          amount: expense.amount,
          hasReceipt: expense.hasReceipt,
          receiptUrl: expense.receiptUrl,
          expenseDate: jobCard.visitDate,
          submittedById: jobCard.supportStaffId,
          jobCardStatus: jobCard.status as JobCardStatus,
        },
        performedBy
      );
    }
  } catch (error) {
    console.error(
      `Failed to create formal expense for JobExpense ${expense.id}:`,
      error
    );
  }

  return expense;
}

export async function updateExpense(
  id: string,
  data: UpdateJobExpenseData,
  performedBy?: string
) {
  const oldExpense = await prisma.jobExpense.findUnique({
    where: { id },
  });

  const expense = await prisma.jobExpense.update({
    where: { id },
    data,
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "JobExpense",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldExpense,
    newData: expense,
  });

  // Update linked formal Expense if exists
  try {
    const linkedExpense = await expenseService.findByJobExpenseId(id);
    if (linkedExpense) {
      const updateData: expenseService.UpdateExpenseData = {};

      // Sync relevant fields
      if (data.amount !== undefined) {
        updateData.amount = data.amount;
      }
      if (data.hasReceipt !== undefined) {
        updateData.hasReceipt = data.hasReceipt as boolean;
      }
      if (data.receiptUrl !== undefined) {
        updateData.receiptUrl = data.receiptUrl as string | null;
      }
      if (data.description !== undefined) {
        updateData.description = data.description as string;
      }

      // Only update if there are changes
      if (Object.keys(updateData).length > 0) {
        await expenseService.update(linkedExpense.id, updateData, performedBy);
      }
    }
  } catch (error) {
    console.error(
      `Failed to update linked formal expense for JobExpense ${id}:`,
      error
    );
  }

  return expense;
}

export async function deleteExpense(id: string, performedBy?: string) {
  const oldExpense = await prisma.jobExpense.findUnique({
    where: { id },
  });

  // Delete linked formal Expense first (due to foreign key constraint)
  try {
    await expenseService.deleteByJobExpenseId(id, performedBy);
  } catch (error) {
    console.error(
      `Failed to delete linked formal expense for JobExpense ${id}:`,
      error
    );
  }

  const expense = await prisma.jobExpense.delete({
    where: { id },
  });

  // Log the deletion
  await createLog({
    action: "DELETE",
    entityType: "JobExpense",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldExpense,
  });

  return expense;
}

// JobCardApproval operations
export async function createApproval(
  data: CreateJobCardApprovalData,
  performedBy?: string
) {
  const { jobCardId, ...approvalData } = data;

  const approval = await prisma.jobCardApproval.create({
    data: {
      ...approvalData,
      jobCard: {
        connect: { id: jobCardId },
      },
    },
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "JobCardApproval",
    entityId: approval.id,
    ...(performedBy && { performedBy }),
    newData: approval,
    metadata: JSON.stringify({ jobCardId }),
  });

  return approval;
}

export async function updateApproval(
  id: string,
  data: UpdateJobCardApprovalData,
  performedBy?: string
) {
  const oldApproval = await prisma.jobCardApproval.findUnique({
    where: { id },
  });

  const approval = await prisma.jobCardApproval.update({
    where: { id },
    data,
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "JobCardApproval",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldApproval,
    newData: approval,
  });

  return approval;
}

export async function deleteApproval(id: string, performedBy?: string) {
  const oldApproval = await prisma.jobCardApproval.findUnique({
    where: { id },
  });

  const approval = await prisma.jobCardApproval.delete({
    where: { id },
  });

  // Log the deletion
  await createLog({
    action: "DELETE",
    entityType: "JobCardApproval",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldApproval,
  });

  return approval;
}
