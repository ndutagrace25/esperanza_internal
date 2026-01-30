import { prisma } from "../lib/prisma.js";
import { createLog } from "./systemLogService.js";

export type CreateClientIntegrationData = {
  clientId: string;
  label: string;
  value: string;
};

export type UpdateClientIntegrationData = Partial<{
  label: string;
  value: string;
}>;

export async function findAllByClientId(clientId: string) {
  return await prisma.clientIntegration.findMany({
    where: { clientId },
    orderBy: { label: "asc" },
  });
}

export async function findById(id: string) {
  return await prisma.clientIntegration.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
        },
      },
    },
  });
}

export async function create(
  data: CreateClientIntegrationData,
  performedBy?: string
) {
  const integration = await prisma.clientIntegration.create({
    data: {
      clientId: data.clientId,
      label: data.label.trim(),
      value: data.value.trim(),
    },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
        },
      },
    },
  });

  await createLog({
    action: "CREATE",
    entityType: "ClientIntegration",
    entityId: integration.id,
    ...(performedBy && { performedBy }),
    newData: integration,
    metadata: JSON.stringify({ clientId: data.clientId }),
  });

  return integration;
}

export async function update(
  id: string,
  data: UpdateClientIntegrationData,
  performedBy?: string
) {
  const existing = await prisma.clientIntegration.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error("Client integration not found");
  }

  const updateData: { label?: string; value?: string } = {};
  if (data.label !== undefined) updateData.label = data.label.trim();
  if (data.value !== undefined) updateData.value = data.value.trim();

  const integration = await prisma.clientIntegration.update({
    where: { id },
    data: updateData,
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
        },
      },
    },
  });

  await createLog({
    action: "UPDATE",
    entityType: "ClientIntegration",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    newData: integration,
    metadata: JSON.stringify({ clientId: existing.clientId }),
  });

  return integration;
}

export async function remove(id: string, performedBy?: string): Promise<void> {
  const existing = await prisma.clientIntegration.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error("Client integration not found");
  }

  await prisma.clientIntegration.delete({
    where: { id },
  });

  await createLog({
    action: "DELETE",
    entityType: "ClientIntegration",
    entityId: id,
    ...(performedBy && { performedBy }),
    oldData: existing,
    metadata: JSON.stringify({ clientId: existing.clientId }),
  });
}
