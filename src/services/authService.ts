import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findByEmail, update } from "./employeeService.js";
import {
  comparePassword,
  generateTempPassword,
  hashPassword,
} from "../utils/password.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import type { Employee } from "@prisma/client";

export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthResponse = {
  employee: Omit<Employee, "password" | "tempPassword">;
  token: string;
};

export type LoginResult =
  | { success: true; data: AuthResponse }
  | { success: false; error: string; requiresPasswordReset?: boolean };

/**
 * Generates a JWT token for an employee
 */
export function generateToken(employeeId: string, email: string): string {
  return jwt.sign({ employeeId, email }, env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

/**
 * Verifies a JWT token
 */
export function verifyToken(
  token: string
): { employeeId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      employeeId: string;
      email: string;
    };
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Authenticates an employee with email and password
 */
export async function login(
  credentials: LoginCredentials
): Promise<LoginResult> {
  const { email, password } = credentials;

  // Find employee by email
  const employee = await findByEmail(email);
  if (!employee) {
    return {
      success: false,
      error: "Invalid email or password",
    };
  }

  // Check if employee is terminated
  if (employee.status === "terminated") {
    return {
      success: false,
      error: "Account access has been terminated",
    };
  }

  // If tempPassword exists, user must reset password before logging in
  if (employee.tempPassword) {
    return {
      success: false,
      error: "Please reset your password to continue",
      requiresPasswordReset: true,
    };
  }

  // No tempPassword - compare with hashed password
  const isPasswordValid = await comparePassword(password, employee.password);
  if (!isPasswordValid) {
    return {
      success: false,
      error: "Invalid email or password",
    };
  }

  // Generate JWT token
  const token = generateToken(employee.id, employee.email);

  // Return employee data without sensitive fields
  const { password: _, tempPassword: __, ...employeeData } = employee;

  return {
    success: true,
    data: {
      employee: employeeData,
      token,
    },
  };
}

export type RequestPasswordResetResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Requests a password reset by sending temporary password via email
 */
export async function requestPasswordReset(
  email: string
): Promise<RequestPasswordResetResult> {
  // Find employee by email
  const employee = await findByEmail(email);
  if (!employee) {
    return {
      success: false,
      error: "Email does not exist in our system",
    };
  }

  // Check if employee is terminated
  if (employee.status === "terminated") {
    return {
      success: false,
      error: "Account access has been terminated",
    };
  }

  // Generate new temporary password
  const tempPassword = generateTempPassword();
  const hashedPassword = await hashPassword(tempPassword);

  // Set expiration date (7 days from now)
  const tempPasswordExpiresAt = new Date();
  tempPasswordExpiresAt.setDate(tempPasswordExpiresAt.getDate() + 7);

  // Update employee with new tempPassword and hashed password
  await update(
    employee.id,
    {
      password: hashedPassword,
      tempPassword: tempPassword,
      tempPasswordExpiresAt: tempPasswordExpiresAt,
    },
    undefined // No performedBy for system-initiated password reset
  );

  // Send email with temporary password
  try {
    await sendPasswordResetEmail(
      employee.email,
      tempPassword,
      employee.firstName
    );
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return {
      success: false,
      error: "Failed to send email. Please try again later.",
    };
  }

  return {
    success: true,
    message: "Password reset email sent successfully",
  };
}

export type ResetPasswordCredentials = {
  email: string;
  tempPassword: string;
  newPassword: string;
};

export type ResetPasswordResult =
  | { success: true; data: AuthResponse }
  | { success: false; error: string; requiresNewTempPassword?: boolean };

/**
 * Resets password using temporary password
 */
export async function resetPassword(
  credentials: ResetPasswordCredentials
): Promise<ResetPasswordResult> {
  const { email, tempPassword, newPassword } = credentials;

  // Find employee by email
  const employee = await findByEmail(email);
  if (!employee) {
    return {
      success: false,
      error: "Invalid email or temporary password",
    };
  }

  // Check if employee is terminated
  if (employee.status === "terminated") {
    return {
      success: false,
      error: "Account access has been terminated",
    };
  }

  // Check if tempPassword exists
  if (!employee.tempPassword) {
    return {
      success: false,
      error:
        "No temporary password found. Please request a password reset first.",
      requiresNewTempPassword: true,
    };
  }

  // Check if tempPassword has expired
  if (
    employee.tempPasswordExpiresAt &&
    employee.tempPasswordExpiresAt < new Date()
  ) {
    return {
      success: false,
      error:
        "Temporary password has expired. Please request a new password reset.",
      requiresNewTempPassword: true,
    };
  }

  // Verify tempPassword matches
  if (employee.tempPassword !== tempPassword) {
    return {
      success: false,
      error: "Invalid email or temporary password",
    };
  }

  // Hash the new password
  const hashedPassword = await hashPassword(newPassword);

  // Update employee: set tempPassword to null, update password, clear expiration
  const updatedEmployee = await update(
    employee.id,
    {
      password: hashedPassword,
      tempPassword: null,
      tempPasswordExpiresAt: null,
    },
    undefined // No performedBy for self-service password reset
  );

  // Generate JWT token for authentication
  const token = generateToken(updatedEmployee.id, updatedEmployee.email);

  // Return employee data without sensitive fields
  const { password: _, tempPassword: __, ...employeeData } = updatedEmployee;

  return {
    success: true,
    data: {
      employee: employeeData,
      token,
    },
  };
}
