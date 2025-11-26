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
  to: string;
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
