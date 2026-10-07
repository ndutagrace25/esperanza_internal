import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { sendEmail } from "../utils/email.js";
import { normalizeMobile } from "./clientLicenseService.js";
import { getBalance, sendSingleSms } from "./smsService.js";

export type SmsBalanceCheckResult = {
  credit: number;
  threshold: number;
  isLow: boolean;
  directorSmsSent: number;
  directorEmailsSent: number;
  errors: string[];
};

/**
 * Check the Advanta SMS credit and, if it is below the threshold, ask every
 * active director to top up by SMS and email. Email still reaches directors
 * if the remaining credit cannot cover the SMS.
 */
export async function checkSmsBalanceAndNotify(
  threshold: number = env.SMS_LOW_BALANCE_THRESHOLD
): Promise<SmsBalanceCheckResult> {
  const balance = await getBalance();
  const credit = Number(balance.credit);
  if (balance.credit === undefined || isNaN(credit)) {
    throw new Error(
      `Unexpected balance response from Advanta: ${JSON.stringify(balance)}`
    );
  }

  const result: SmsBalanceCheckResult = {
    credit,
    threshold,
    isLow: credit < threshold,
    directorSmsSent: 0,
    directorEmailsSent: 0,
    errors: [],
  };
  if (!result.isLow) return result;

  const directors = await prisma.employee.findMany({
    where: { status: "active", role: { name: "DIRECTOR" } },
    select: { firstName: true, email: true, phone: true },
  });

  const creditText = credit.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  for (const director of directors) {
    const mobile = normalizeMobile(director.phone);
    if (!mobile) continue;
    try {
      await sendSingleSms({
        mobile,
        message: `Hi ${director.firstName}, the Esperanza SMS credit is low (${creditText}). Please top up the Advanta account to keep SMS reminders going.`,
      });
      result.directorSmsSent++;
    } catch (err) {
      result.errors.push(
        `SMS to ${director.firstName}: ${err instanceof Error ? err.message : "failed"}`
      );
    }
  }

  const emails = directors.map((d) => d.email).filter(Boolean);
  if (emails.length > 0) {
    try {
      await sendEmail({
        to: emails,
        subject: `Low SMS credit: ${creditText} remaining`,
        text: `The Esperanza SMS credit on Advanta is ${creditText}, below the alert level of ${threshold}. Please top up the Advanta account so SMS reminders and greetings keep going out.`,
        html: `
          <p>Hello,</p>
          <p>The Esperanza SMS credit on Advanta is <strong>${creditText}</strong>,
          below the alert level of ${threshold}.</p>
          <p>Please top up the Advanta account so SMS reminders and greetings keep going out.</p>
        `,
      });
      result.directorEmailsSent = emails.length;
    } catch (err) {
      result.errors.push(
        `Email to directors: ${err instanceof Error ? err.message : "failed"}`
      );
    }
  }

  return result;
}
