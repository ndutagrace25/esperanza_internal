import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * Generates a random temporary password
 * @param length - Length of the password (default: 12)
 * @returns Random password string
 */
export function generateTempPassword(length = 12): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";
  const allChars = uppercase + lowercase + numbers + special;

  // Ensure at least one character from each category
  let password = "";
  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += numbers[crypto.randomInt(0, numbers.length)];
  password += special[crypto.randomInt(0, special.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)];
  }

  // Shuffle the password using Fisher-Yates algorithm
  const passwordArray = password.split("");
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = passwordArray[i];
    if (temp !== undefined && passwordArray[j] !== undefined) {
      passwordArray[i] = passwordArray[j];
      passwordArray[j] = temp;
    }
  }

  return passwordArray.join("");
}

/**
 * Hashes a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compares a plain text password with a hashed password
 * @param password - Plain text password
 * @param hashedPassword - Hashed password
 * @returns True if passwords match
 */
export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
