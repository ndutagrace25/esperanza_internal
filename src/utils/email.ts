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
            </tr>
          `
          )
          .join("")
      : '<tr><td colspan="3" style="padding: 8px; text-align: center; color: #666;">No tasks added</td></tr>';

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
              <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">KES ${Number(
                expense.amount
              ).toLocaleString("en-KE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</td>
            </tr>
          `
          )
          .join("")
      : '<tr><td colspan="3" style="padding: 8px; text-align: center; color: #666;">No expenses added</td></tr>';

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
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${expensesHtml}
                ${
                  jobCard.expenses.length > 0
                    ? `
                <tr>
                  <td colspan="2" class="total">Total:</td>
                  <td class="total">KES ${totalExpenses.toLocaleString(
                    "en-KE",
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}</td>
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
       Amount: KES ${Number(expense.amount).toLocaleString("en-KE", {
         minimumFractionDigits: 2,
         maximumFractionDigits: 2,
       })}
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

/**
 * Sends expense notification email to directors
 */
export async function sendExpenseNotificationEmail(
  expense: {
    expenseNumber: string;
    description: string;
    amount: number;
    expenseDate: Date;
    category: { name: string };
    vendor: string | null;
    status: string;
    hasReceipt: boolean;
    jobCard: { jobNumber: string; client: { companyName: string } } | null;
    submittedBy: { firstName: string; lastName: string; email: string } | null;
  },
  directorEmails: string[],
  action: "created" | "updated"
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

  const formatCurrency = (amount: number): string => {
    return `KES ${amount.toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const submitterName = expense.submittedBy
    ? `${expense.submittedBy.firstName} ${expense.submittedBy.lastName}`
    : "Unknown";

  const statusColor = {
    DRAFT: "#64748b",
    PENDING: "#f59e0b",
    APPROVED: "#3b82f6",
    PAID: "#22c55e",
    REJECTED: "#ef4444",
    CANCELLED: "#6b7280",
  }[expense.status] || "#64748b";

  const actionTitle = action === "created" ? "New Expense Submitted" : "Expense Updated";
  const actionVerb = action === "created" ? "submitted" : "updated";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin: 15px 0; }
        .info-row { margin: 10px 0; }
        .info-label { font-weight: bold; color: #666; display: block; font-size: 12px; text-transform: uppercase; }
        .info-value { font-size: 16px; margin-top: 2px; }
        .amount { font-size: 24px; font-weight: bold; color: #059669; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; color: white; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .job-card-link { background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 4px; padding: 10px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${actionTitle}</h1>
        </div>
        <div class="content">
          <p>Dear Director,</p>
          <p>An expense has been ${actionVerb} in the system and requires your attention.</p>
          
          <div class="info-box">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
              <div>
                <div class="info-label">Expense Number</div>
                <div class="info-value" style="font-weight: bold;">${expense.expenseNumber}</div>
              </div>
              <div>
                <span class="status-badge" style="background-color: ${statusColor};">${expense.status}</span>
              </div>
            </div>
            
            <div style="text-align: center; padding: 15px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee; margin: 15px 0;">
              <div class="info-label">Amount</div>
              <div class="amount">${formatCurrency(expense.amount)}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div class="info-row">
                <span class="info-label">Category</span>
                <span class="info-value">${expense.category.name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Expense Date</span>
                <span class="info-value">${formatDate(expense.expenseDate)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Submitted By</span>
                <span class="info-value">${submitterName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Has Receipt</span>
                <span class="info-value">${expense.hasReceipt ? "Yes" : "No"}</span>
              </div>
              ${expense.vendor ? `
              <div class="info-row">
                <span class="info-label">Vendor</span>
                <span class="info-value">${expense.vendor}</span>
              </div>
              ` : ""}
            </div>

            <div class="info-row" style="margin-top: 15px;">
              <span class="info-label">Description</span>
              <span class="info-value">${expense.description}</span>
            </div>
          </div>

          ${expense.jobCard ? `
          <div class="job-card-link">
            <strong>📋 Linked to Job Card:</strong> ${expense.jobCard.jobNumber} - ${expense.jobCard.client.companyName}
          </div>
          ` : ""}

          <p>Please review and take appropriate action in the system.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from Esperanza Internal System. Please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
    ${actionTitle}
    
    An expense has been ${actionVerb} in the system.
    
    Expense Details:
    - Expense Number: ${expense.expenseNumber}
    - Amount: ${formatCurrency(expense.amount)}
    - Category: ${expense.category.name}
    - Expense Date: ${formatDate(expense.expenseDate)}
    - Status: ${expense.status}
    - Submitted By: ${submitterName}
    - Has Receipt: ${expense.hasReceipt ? "Yes" : "No"}
    ${expense.vendor ? `- Vendor: ${expense.vendor}` : ""}
    
    Description: ${expense.description}
    
    ${expense.jobCard ? `Linked to Job Card: ${expense.jobCard.jobNumber} - ${expense.jobCard.client.companyName}` : ""}
    
    Please review and take appropriate action in the system.
  `;

  await sendEmail({
    to: directorEmails,
    subject: `${actionTitle}: ${expense.expenseNumber} - ${formatCurrency(expense.amount)}`,
    html,
    text,
  });
}