import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE, // true for 465, false for other ports
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export type EmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

/**
 * Sends an email
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    await transporter.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send email");
  }
}

/**
 * Sends password reset email with temporary password
 */
export async function sendPasswordResetEmail(
  email: string,
  tempPassword: string,
  firstName: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .password-box { background-color: #fff; border: 2px solid #4CAF50; padding: 15px; margin: 20px 0; text-align: center; font-size: 18px; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello ${firstName},</p>
          <p>You have requested to reset your password. Please use the temporary password below to reset your password:</p>
          <div class="password-box">
            ${tempPassword}
          </div>
          <p>This temporary password will expire in 7 days. Please reset your password as soon as possible.</p>
          <p>If you did not request this password reset, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>This is an automated message, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    Hello ${firstName},
    
    You have requested to reset your password. Please use the temporary password below to reset your password:
    
    ${tempPassword}
    
    This temporary password will expire in 7 days. Please reset your password as soon as possible.
    
    If you did not request this password reset, please ignore this email.
  `;

  await sendEmail({
    to: email,
    subject: "Password Reset Request - Esperanza Internal",
    html,
    text,
  });
}

/**
 * Sends job card creation notification email to directors
 */
export async function sendJobCardNotificationEmail(
  jobCard: {
    jobNumber: string;
    visitDate: Date;
    client: {
      companyName: string;
      contactPerson: string | null;
      email: string | null;
      phone: string | null;
    };
    supportStaff: {
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    tasks: Array<{
      moduleName: string | null;
      taskType: string | null;
      description: string;
      startTime: Date | null;
      endTime: Date | null;
    }>;
    expenses: Array<{
      category: string;
      description: string | null;
      amount: number;
      hasReceipt: boolean;
    }>;
  },
  directorEmails: string[]
): Promise<void> {
  if (directorEmails.length === 0) {
    return; // No directors to notify
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const creatorName = jobCard.supportStaff
    ? `${jobCard.supportStaff.firstName} ${jobCard.supportStaff.lastName}`
    : "Unknown";

  const tasksHtml =
    jobCard.tasks.length > 0
      ? jobCard.tasks
          .map(
            (task, index) => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                index + 1
              }</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                task.moduleName || "—"
              }</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                task.taskType || "—"
              }</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                task.description
              }</td>
            </tr>
          `
          )
          .join("")
      : '<tr><td colspan="4" style="padding: 8px; text-align: center; color: #666;">No tasks added</td></tr>';

  const totalExpenses = jobCard.expenses.reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );

  const expensesHtml =
    jobCard.expenses.length > 0
      ? jobCard.expenses
          .map(
            (expense, index) => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                index + 1
              }</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                expense.category
              }</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd;">${
                expense.description || "—"
              }</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">KES ${Number(
                expense.amount
              ).toLocaleString("en-KE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</td>
              <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${
                expense.hasReceipt ? "Yes" : "No"
              }</td>
            </tr>
          `
          )
          .join("")
      : '<tr><td colspan="5" style="padding: 8px; text-align: center; color: #666;">No expenses added</td></tr>';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin: 15px 0; }
        .info-row { display: flex; margin: 8px 0; }
        .info-label { font-weight: bold; width: 150px; }
        .info-value { flex: 1; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; background-color: #fff; }
        th { background-color: #2563eb; color: white; padding: 10px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #ddd; }
        .total { font-weight: bold; text-align: right; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Job Card Created</h1>
        </div>
        <div class="content">
          <p>Dear Director,</p>
          <p>A new job card has been created in the system. Please find the details below:</p>
          
          <div class="info-box">
            <h3 style="margin-top: 0;">Job Card Information</h3>
            <div class="info-row">
              <span class="info-label">Job Number:</span>
              <span class="info-value">${jobCard.jobNumber}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Visit Date:</span>
              <span class="info-value">${formatDate(jobCard.visitDate)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Created By:</span>
              <span class="info-value">${creatorName}</span>
            </div>
          </div>

          <div class="info-box">
            <h3 style="margin-top: 0;">Client Information</h3>
            <div class="info-row">
              <span class="info-label">Company Name:</span>
              <span class="info-value">${jobCard.client.companyName}</span>
            </div>
            ${
              jobCard.client.contactPerson
                ? `
            <div class="info-row">
              <span class="info-label">Contact Person:</span>
              <span class="info-value">${jobCard.client.contactPerson}</span>
            </div>
            `
                : ""
            }
            ${
              jobCard.client.email
                ? `
            <div class="info-row">
              <span class="info-label">Email:</span>
              <span class="info-value">${jobCard.client.email}</span>
            </div>
            `
                : ""
            }
            ${
              jobCard.client.phone
                ? `
            <div class="info-row">
              <span class="info-label">Phone:</span>
              <span class="info-value">${jobCard.client.phone}</span>
            </div>
            `
                : ""
            }
          </div>

          <div class="info-box">
            <h3 style="margin-top: 0;">Tasks (${jobCard.tasks.length})</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Module Name</th>
                  <th>Task Type</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${tasksHtml}
              </tbody>
            </table>
          </div>

          <div class="info-box">
            <h3 style="margin-top: 0;">Expenses (${
              jobCard.expenses.length
            })</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Has Receipt</th>
                </tr>
              </thead>
              <tbody>
                ${expensesHtml}
                ${
                  jobCard.expenses.length > 0
                    ? `
                <tr>
                  <td colspan="3" class="total">Total:</td>
                  <td class="total">KES ${totalExpenses.toLocaleString(
                    "en-KE",
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}</td>
                  <td></td>
                </tr>
                `
                    : ""
                }
              </tbody>
            </table>
          </div>

          <p>Please review the job card details in the system.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from Esperanza Internal System. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    New Job Card Created
    
    A new job card has been created in the system.
    
    Job Card Information:
    - Job Number: ${jobCard.jobNumber}
    - Visit Date: ${formatDate(jobCard.visitDate)}
    - Created By: ${creatorName}
    
    Client Information:
    - Company Name: ${jobCard.client.companyName}
    ${
      jobCard.client.contactPerson
        ? `- Contact Person: ${jobCard.client.contactPerson}`
        : ""
    }
    ${jobCard.client.email ? `- Email: ${jobCard.client.email}` : ""}
    ${jobCard.client.phone ? `- Phone: ${jobCard.client.phone}` : ""}
    
    Tasks (${jobCard.tasks.length}):
    ${
      jobCard.tasks.length > 0
        ? jobCard.tasks
            .map(
              (task, index) => `
     ${index + 1}. ${task.moduleName || "N/A"} - ${task.taskType || "N/A"}
       Description: ${task.description}
    `
            )
            .join("")
        : "No tasks added"
    }
    
    Expenses (${jobCard.expenses.length}):
    ${
      jobCard.expenses.length > 0
        ? jobCard.expenses
            .map(
              (expense, index) => `
    ${index + 1}. ${expense.category}
       Description: ${expense.description || "N/A"}
       Amount: KES ${Number(expense.amount).toLocaleString("en-KE", {
         minimumFractionDigits: 2,
         maximumFractionDigits: 2,
       })}
       Has Receipt: ${expense.hasReceipt ? "Yes" : "No"}
    `
            )
            .join("")
        : "No expenses added"
    }
    ${
      jobCard.expenses.length > 0
        ? `Total Expenses: KES ${totalExpenses.toLocaleString("en-KE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : ""
    }
    
    Please review the job card details in the system.
  `;

  // Send email to all directors
  await sendEmail({
    to: directorEmails,
    subject: `New Job Card Created: ${jobCard.jobNumber} - ${jobCard.client.companyName}`,
    html,
    text,
  });
}
