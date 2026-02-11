import { prisma } from "../lib/prisma.js";
import { sendSingleSms } from "./smsService.js";

const COMPANY_NAME = "ESPERANZA DIGITAL SOLUTIONS LTD";
const BANK_ACCOUNT = "2053858417";
const PAYBILL = "303030";

/**
 * Normalize Kenyan mobile to 254XXXXXXXXX for SMS API.
 */
function normalizeMobile(phone: string | null): string | null {
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

/**
 * Due date for the reminder message: 3rd of the current month at 00:00:00.
 */
function getDueDateString(now: Date): string {
  const due = new Date(now.getFullYear(), now.getMonth(), 3, 0, 0, 0, 0);
  return due.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Find sales that are not fully paid and whose last PAID installment
 * was in the previous month (or they have no paid installments).
 */
export async function getSalesDueForReminder(now: Date = new Date()) {
  const sales = await prisma.sale.findMany({
    where: {
      status: { not: "CANCELLED" },
      totalAmount: { gt: 0 },
      // Exclude sales that have requested a payment date extension (they get a separate reminder)
      requestedPaymentDateExtension: { not: true },
    },
    select: {
      id: true,
      saleNumber: true,
      totalAmount: true,
      paidAmount: true,
      clientId: true,
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          phone: true,
          alternatePhone: true,
        },
      },
      installments: {
        where: { status: "PAID" },
        orderBy: { paidAt: "desc" },
        take: 1,
        select: { paidAt: true },
      },
    },
  });

  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  return sales.filter((sale) => {
    const paid = Number(sale.paidAmount);
    const total = Number(sale.totalAmount);
    if (paid >= total) return false;

    const lastPaid = sale.installments[0];
    if (!lastPaid) return true; // No paid installments → send reminder
    const paidAt = new Date(lastPaid.paidAt);
    return paidAt.getFullYear() === prevYear && paidAt.getMonth() === prevMonth;
  });
}

/**
 * Format a list of names for the director summary: "A, B and C" or "A" or "no clients".
 */
function formatClientList(names: string[]): string {
  const unique = [...new Set(names)];
  if (unique.length === 0) return "no clients";
  if (unique.length === 1) return unique[0] ?? "no clients";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  const last = unique[unique.length - 1];
  return `${unique.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * Fetch employees with DIRECTOR role who have a phone number.
 */
async function getDirectorsWithPhone() {
  return await prisma.employee.findMany({
    where: {
      status: "active",
      role: { name: "DIRECTOR" },
      phone: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      phone: true,
    },
  });
}

/**
 * Send payment reminder SMS for all sales due for reminder.
 * One SMS per sale; uses client's phone or alternatePhone.
 * Then sends a summary SMS to each DIRECTOR listing clients who received the reminder.
 */
export async function sendPaymentReminders(now: Date = new Date()): Promise<{
  sent: number;
  skipped: number;
  errors: Array<{ saleNumber: string; client: string; reason: string }>;
  directorSummarySent: number;
}> {
  const dueSales = await getSalesDueForReminder(now);
  const dueDateStr = getDueDateString(now);
  const customerName = (c: {
    contactPerson: string | null;
    companyName: string;
  }) =>
    (c.contactPerson && c.contactPerson.trim()) ||
    c.companyName ||
    "Valued Customer";

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ saleNumber: string; client: string; reason: string }> =
    [];
  const clientNamesSent: string[] = [];

  for (const sale of dueSales) {
    const client = sale.client;
    const mobile =
      normalizeMobile(client.phone) || normalizeMobile(client.alternatePhone);

    if (!mobile) {
      skipped++;
      errors.push({
        saleNumber: sale.saleNumber,
        client: client.companyName,
        reason: "No valid phone number",
      });
      continue;
    }

    const message = `Dear ${customerName(
      client
    )}, your monthly Ventura Prime ERP Software subscription is due for renewal on ${dueDateStr}.\nCompany name: ${COMPANY_NAME}\nBank account: ${BANK_ACCOUNT}\nPaybill: ${PAYBILL}\nAccount number: ${BANK_ACCOUNT}`;

    try {
      await sendSingleSms({ message, mobile });
      sent++;
      clientNamesSent.push(customerName(client));
    } catch (err) {
      errors.push({
        saleNumber: sale.saleNumber,
        client: client.companyName,
        reason: err instanceof Error ? err.message : "SMS send failed",
      });
    }
  }

  let directorSummarySent = 0;
  const directors = await getDirectorsWithPhone();
  const clientList = formatClientList(clientNamesSent);

  for (const director of directors) {
    const mobile = normalizeMobile(director.phone);
    if (!mobile) continue;
    const personalised =
      sent === 0
        ? `Hi ${director.firstName}, no clients were sent the monthly subscription reminder today.`
        : `Hi ${director.firstName}, clients ${clientList} have received their monthly subscription reminder.`;
    try {
      await sendSingleSms({ message: personalised, mobile });
      directorSummarySent++;
    } catch {
      // Log but don't fail the whole run
    }
  }

  return { sent, skipped, errors, directorSummarySent };
}

/**
 * Format extension due date for SMS (e.g. "13 Jan 2026").
 */
function formatExtensionDueDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Find sales that have requested a payment extension and whose extension due date
 * falls 1, 2, or 3 days from today. Those clients receive a reminder on each of those days.
 * E.g. extension date 13 Jan → reminders on 10th, 11th, 12th.
 */
export async function getSalesDueForExtensionReminder(
  now: Date = new Date()
) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const start = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 3, 23, 59, 59, 999));

  const sales = await prisma.sale.findMany({
    where: {
      status: { not: "CANCELLED" },
      requestedPaymentDateExtension: true,
      paymentExtensionDueDate: { not: null, gte: start, lte: end },
      totalAmount: { gt: 0 },
    },
    select: {
      id: true,
      saleNumber: true,
      totalAmount: true,
      paidAmount: true,
      paymentExtensionDueDate: true,
      clientId: true,
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          phone: true,
          alternatePhone: true,
        },
      },
    },
  });

  return sales.filter((sale) => Number(sale.paidAmount) < Number(sale.totalAmount));
}

/**
 * Send payment extension reminder SMS: one per sale whose extension due date
 * is 1–3 days from today. Then notify directors.
 */
export async function sendPaymentExtensionReminders(
  now: Date = new Date()
): Promise<{
  sent: number;
  skipped: number;
  errors: Array<{ saleNumber: string; client: string; reason: string }>;
  directorSummarySent: number;
}> {
  const dueSales = await getSalesDueForExtensionReminder(now);
  const customerName = (c: {
    contactPerson: string | null;
    companyName: string;
  }) =>
    (c.contactPerson && c.contactPerson.trim()) ||
    c.companyName ||
    "Valued Customer";

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ saleNumber: string; client: string; reason: string }> =
    [];
  const clientNamesSent: string[] = [];

  for (const sale of dueSales) {
    const client = sale.client;
    const mobile =
      normalizeMobile(client.phone) || normalizeMobile(client.alternatePhone);

    if (!mobile) {
      skipped++;
      errors.push({
        saleNumber: sale.saleNumber,
        client: client.companyName,
        reason: "No valid phone number",
      });
      continue;
    }

    const extensionDate = sale.paymentExtensionDueDate
      ? formatExtensionDueDate(sale.paymentExtensionDueDate.toISOString())
      : "";
    const message = `Dear ${customerName(
      client
    )}, your payment extension for Ventura Prime ERP Software is due on ${extensionDate}. Please ensure payment by then.\nCompany name: ${COMPANY_NAME}\nBank account: ${BANK_ACCOUNT}\nPaybill: ${PAYBILL}\nAccount number: ${BANK_ACCOUNT}`;

    try {
      await sendSingleSms({ message, mobile });
      sent++;
      clientNamesSent.push(customerName(client));
    } catch (err) {
      errors.push({
        saleNumber: sale.saleNumber,
        client: client.companyName,
        reason: err instanceof Error ? err.message : "SMS send failed",
      });
    }
  }

  let directorSummarySent = 0;
  if (sent > 0) {
    const directors = await getDirectorsWithPhone();
    const clientList = formatClientList(clientNamesSent);
    for (const director of directors) {
      const mobile = normalizeMobile(director.phone);
      if (!mobile) continue;
      const personalised = `Hi ${director.firstName}, clients ${clientList} have received their payment extension reminder (due in 1–3 days).`;
      try {
        await sendSingleSms({ message: personalised, mobile });
        directorSummarySent++;
      } catch {
        // Log but don't fail the whole run
      }
    }
  }

  return { sent, skipped, errors, directorSummarySent };
}
