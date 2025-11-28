import { prisma } from "../lib/prisma.js";
import type { Client, Prisma } from "@prisma/client";
import { createLog } from "./systemLogService.js";

export type CreateClientData = Omit<
  Prisma.ClientCreateInput,
  "assignedTo" | "broughtInBy" | "createdAt" | "updatedAt"
> & {
  assignedToId?: string | null;
  broughtInById?: string | null;
};

export type UpdateClientData = Partial<
  Omit<
    Prisma.ClientUpdateInput,
    "assignedTo" | "broughtInBy" | "createdAt" | "updatedAt"
  >
> & {
  assignedToId?: string | null;
  broughtInById?: string | null;
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

type ClientWithRelations = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  website: string | null;
  taxId: string | null;
  status: string;
  notes: string | null;
  broughtInById: string | null;
  broughtInBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  assignedToId: string | null;
  assignedTo: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function findAll(
  options: PaginationOptions = {}
): Promise<PaginatedResult<ClientWithRelations>> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const skip = (page - 1) * limit;

  // Get total count (excluding archived)
  const total = await prisma.client.count({
    where: {
      status: {
        not: "archived",
      },
    },
  });

  // Get paginated clients (excluding archived)
  const clients = await prisma.client.findMany({
    where: {
      status: {
        not: "archived",
      },
    },
    select: {
      id: true,
      companyName: true,
      contactPerson: true,
      email: true,
      phone: true,
      alternatePhone: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      website: true,
      taxId: true,
      status: true,
      notes: true,
      broughtInById: true,
      broughtInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedToId: true,
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
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
    data: clients,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export async function findById(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      broughtInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });
}

export async function create(
  data: CreateClientData,
  performedBy?: string
): Promise<Client> {
  const { assignedToId, broughtInById, ...clientData } = data;

  const createData: Prisma.ClientCreateInput = {
    ...clientData,
  };

  if (assignedToId) {
    createData.assignedTo = {
      connect: { id: assignedToId },
    };
  }

  if (broughtInById) {
    createData.broughtInBy = {
      connect: { id: broughtInById },
    };
  }

  const client = await prisma.client.create({
    data: createData,
    include: {
      broughtInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Log the creation
  await createLog({
    action: "CREATE",
    entityType: "Client",
    entityId: client.id,
    ...(performedBy && { performedBy }),
    newData: client,
  });

  return client;
}

export async function update(
  id: string,
  data: UpdateClientData,
  performedBy?: string
): Promise<Client> {
  // Get old data for logging
  const oldClient = await prisma.client.findUnique({
    where: { id },
    include: {
      broughtInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const { assignedToId, broughtInById, ...clientData } = data;

  const updateData: Prisma.ClientUpdateInput = {
    ...clientData,
  };

  if (assignedToId !== undefined) {
    if (assignedToId === null) {
      updateData.assignedTo = {
        disconnect: true,
      };
    } else {
      updateData.assignedTo = {
        connect: { id: assignedToId },
      };
    }
  }

  if (broughtInById !== undefined) {
    if (broughtInById === null) {
      updateData.broughtInBy = {
        disconnect: true,
      };
    } else {
      updateData.broughtInBy = {
        connect: { id: broughtInById },
      };
    }
  }

  const client = await prisma.client.update({
    where: { id },
    data: updateData,
    include: {
      broughtInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Log the update
  await createLog({
    action: "UPDATE",
    entityType: "Client",
    entityId: client.id,
    ...(performedBy && { performedBy }),
    oldData: oldClient,
    newData: client,
  });

  return client;
}

export async function deleteClient(
  id: string,
  performedBy?: string
): Promise<Client> {
  // Get old data for logging
  const oldClient = await prisma.client.findUnique({
    where: { id },
    include: {
      broughtInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!oldClient) {
    throw new Error("Client not found");
  }

  // Update client status to archived instead of deleting
  const client = await prisma.client.update({
    where: { id },
    data: {
      status: "archived",
    },
    include: {
      broughtInBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Log the deletion (archival)
  await createLog({
    action: "DELETE",
    entityType: "Client",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: oldClient,
    newData: client,
  });

  return client;
}
