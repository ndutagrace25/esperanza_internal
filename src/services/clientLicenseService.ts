import { prisma } from "../lib/prisma.js";
import { sendSingleSms } from "./smsService.js";

const LOGGED_DEVICE_ID = "a9kvkn";

/**
 * Normalize Kenyan mobile to 254XXXXXXXXX for SMS API.
 */
function normalizeMobile(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("7")) return `254${digits}`;
  if (digits.length === 10 && digits.startsWith("0"))
    return `254${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("254")) return digits;
  return digits.length >= 9
    ? digits.startsWith("254")
      ? digits
      : `254${digits.slice(-9)}`
    : null;
}

function formatExpiryDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type LoginResponse = {
  success: boolean;
  message?: string;
  data?: {
    accessToken: string;
    refreshToken?: string;
    tokenExpiresIn?: number;
  };
};

type CompanyResponse = {
  success: boolean;
  message?: string;
  data?: {
    id: number;
    code: string;
    name?: string;
    licenseExpiryDate?: string;
    [key: string]: unknown;
  };
};

/**
 * Update a client's license expiry date in their system only (no SMS).
 * Uses client's backendBaseUrl, apiUserName, apiPassword to:
 * 1. POST /auth/login to get accessToken
 * 2. GET /company to get company code
 * 3. PATCH /company/update/:code with { licenseExpiryDate }
 */
export async function updateClientLicenseExpiryOnly(
  clientId: string,
  licenseExpiryDate: string
): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      backendBaseUrl: true,
      apiUserName: true,
      apiPassword: true,
    },
  });

  if (!client) {
    throw new Error("Client not found");
  }

  const { backendBaseUrl, apiUserName, apiPassword } = client;
  if (!backendBaseUrl?.trim() || !apiUserName?.trim() || !apiPassword?.trim()) {
    throw new Error(
      "Client is not configured for license extension. Set backend base URL and API credentials (apiUserName, apiPassword) for this client."
    );
  }

  const baseUrl = backendBaseUrl.replace(/\/$/, "");

  const loginUrl = `${baseUrl}/auth/login`;
  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: apiUserName,
      password: apiPassword,
      loggedDeviceId: LOGGED_DEVICE_ID,
    }),
  });

  if (!loginResponse.ok) {
    const text = await loginResponse.text();
    throw new Error(
      `Client login failed (${loginResponse.status}): ${text || loginResponse.statusText}`
    );
  }

  const loginData = (await loginResponse.json()) as LoginResponse;
  const accessToken = loginData.data?.accessToken;
  if (!accessToken) {
    throw new Error(
      "Client login response did not include accessToken. " +
        (loginData.message || "Unknown error.")
    );
  }

  const companyUrl = `${baseUrl}/company`;
  const companyResponse = await fetch(companyUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!companyResponse.ok) {
    const text = await companyResponse.text();
    throw new Error(
      `Failed to fetch client company (${companyResponse.status}): ${text || companyResponse.statusText}`
    );
  }

  const companyData = (await companyResponse.json()) as CompanyResponse;
  const code = companyData.data?.code;
  if (!code) {
    throw new Error(
      "Company response did not include code. " +
        (companyData.message || "Unknown error.")
    );
  }

  const updateUrl = `${baseUrl}/company/update/${encodeURIComponent(code)}`;
  const updateResponse = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ licenseExpiryDate }),
  });

  if (!updateResponse.ok) {
    const text = await updateResponse.text();
    throw new Error(
      `Failed to update client license expiry (${updateResponse.status}): ${text || updateResponse.statusText}`
    );
  }
}

/**
 * Extend a client's system license expiry date and send extension SMS to client and directors.
 */
export async function extendClientLicense(
  clientId: string,
  licenseExpiryDate: string
): Promise<void> {
  await updateClientLicenseExpiryOnly(clientId, licenseExpiryDate);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      companyName: true,
      phone: true,
      alternatePhone: true,
    },
  });
  if (!client) return;

  const expiryFormatted = formatExpiryDate(licenseExpiryDate);
  const clientMobile =
    normalizeMobile(client.phone) || normalizeMobile(client.alternatePhone);
  if (clientMobile) {
    try {
      await sendSingleSms({
        mobile: clientMobile,
        message: `Your system license for ${client.companyName} has been extended. New expiry date: ${expiryFormatted}. Thank you.`,
      });
    } catch (err) {
      console.error(
        "[clientLicenseService] Failed to send SMS to client after license extension:",
        err
      );
    }
  }

  try {
    const directors = await prisma.employee.findMany({
      where: {
        status: "active",
        role: { name: "DIRECTOR" },
        phone: { not: null },
      },
      select: { id: true, firstName: true, phone: true },
    });
    for (const director of directors) {
      const mobile = director.phone ? normalizeMobile(director.phone) : null;
      if (!mobile) continue;
      try {
        await sendSingleSms({
          mobile,
          message: `License extended for client ${client.companyName}. New expiry date: ${expiryFormatted}.`,
        });
      } catch (err) {
        console.error(
          `[clientLicenseService] Failed to send SMS to director ${director.id}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error(
      "[clientLicenseService] Failed to fetch directors or send director notifications:",
      err
    );
  }
}

/**
 * Send payment-received SMS to client and directors (after recording an installment and updating license).
 * currentMonthLabel e.g. "January 2026", newExpiryDateFormatted e.g. "3 Feb 2026".
 */
export async function sendPaymentReceivedNotifications(
  clientId: string,
  currentMonthLabel: string,
  newExpiryDateFormatted: string
): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      companyName: true,
      phone: true,
      alternatePhone: true,
    },
  });
  if (!client) return;

  const clientMobile =
    normalizeMobile(client.phone) || normalizeMobile(client.alternatePhone);
  if (clientMobile) {
    try {
      await sendSingleSms({
        mobile: clientMobile,
        message: `We have received your payment for ${currentMonthLabel}. Your license has been extended to ${newExpiryDateFormatted}. Thank you.`,
      });
    } catch (err) {
      console.error(
        "[clientLicenseService] Failed to send payment-received SMS to client:",
        err
      );
    }
  }

  try {
    const directors = await prisma.employee.findMany({
      where: {
        status: "active",
        role: { name: "DIRECTOR" },
        phone: { not: null },
      },
      select: { id: true, firstName: true, phone: true },
    });
    for (const director of directors) {
      const mobile = director.phone ? normalizeMobile(director.phone) : null;
      if (!mobile) continue;
      try {
        await sendSingleSms({
          mobile,
          message: `Client ${client.companyName} has paid their installment for ${currentMonthLabel}. License expiry updated to ${newExpiryDateFormatted}.`,
        });
      } catch (err) {
        console.error(
          `[clientLicenseService] Failed to send payment-received SMS to director ${director.id}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error(
      "[clientLicenseService] Failed to fetch directors or send director notifications:",
      err
    );
  }
}
