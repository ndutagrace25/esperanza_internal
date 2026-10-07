import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Validate required environment variables
const validateEnv = () => {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing: string[] = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => {
      console.error(`  - ${key}`);
    });
    console.error("\n💡 Copy env.template to .env and fill in the values");
    process.exit(1);
  }

  // Validate PORT if provided
  if (process.env["PORT"]) {
    const port = parseInt(process.env["PORT"], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("❌ PORT must be a valid number between 1 and 65535");
      process.exit(1);
    }
  }

  // Validate NODE_ENV if provided
  const validEnvs = ["development", "production", "test"];
  if (process.env["NODE_ENV"] && !validEnvs.includes(process.env["NODE_ENV"])) {
    console.error(`❌ NODE_ENV must be one of: ${validEnvs.join(", ")}`);
    process.exit(1);
  }
};

// Validate on import
validateEnv();

// Environment configuration
export const env = {
  // Database
  DATABASE_URL: process.env["DATABASE_URL"]!,

  // Server
  PORT: process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3000,
  NODE_ENV: (process.env["NODE_ENV"] || "development") as
    | "development"
    | "production"
    | "test",

  // JWT
  JWT_SECRET: process.env["JWT_SECRET"]!,

  // Email (SMTP)
  SMTP_HOST: process.env["SMTP_HOST"] || "smtp.gmail.com",
  SMTP_PORT: process.env["SMTP_PORT"]
    ? parseInt(process.env["SMTP_PORT"], 10)
    : 587,
  SMTP_SECURE: process.env["SMTP_SECURE"] === "true",
  SMTP_USER: process.env["SMTP_USER"] || "",
  SMTP_PASS: process.env["SMTP_PASS"] || "",
  SMTP_FROM: process.env["SMTP_FROM"] || process.env["SMTP_USER"] || "",

  // Optional API keys
  API_KEY: process.env["API_KEY"],

  // SMS (Advanta/QuickSMS)
  SMS_BASE_URL: process.env["SMS_BASE_URL"] || "https://quicksms.advantasms.com",
  SMS_API_KEY: process.env["SMS_API_KEY"] || "",
  SMS_SHORTCODE: process.env["SMS_SHORTCODE"] || "",
  SMS_PARTNER_ID: process.env["SMS_PARTNER_ID"] || "",
  // Directors are alerted by the daily balance check when credit drops below this
  SMS_LOW_BALANCE_THRESHOLD: process.env["SMS_LOW_BALANCE_THRESHOLD"]
    ? Number(process.env["SMS_LOW_BALANCE_THRESHOLD"])
    : 100,

  // Ventura licensing: Ed25519 private key (PKCS#8 PEM, base64-encoded on one
  // line) used to sign client licences. Generate with `npm run license:keygen`.
  // Never commit it; the matching public key is built into the Ventura backend.
  LICENSE_PRIVATE_KEY: process.env["LICENSE_PRIVATE_KEY"] || "",
} as const;
