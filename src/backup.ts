import cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();
const execAsync = promisify(exec);

const BACKUP_DIR = process.env["BACKUP_DIR"] || "C:/pg_backups";
const PG_DUMP_PATH = process.env["PG_DUMP_PATH"] || "pg_dump";

async function runBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/:/g, "-");
  const fileName = `${process.env["BUCKUP_FILE_NAME"]}-${dateStr}.sql`;
  const filePath = path.join(BACKUP_DIR, fileName);

  const {
    PGUSER,
    PGHOST,
    PGPORT,
    PGDATABASE,
    PGPASSWORD,
    EMAIL_USER,
    EMAIL_PASS,
    EMAIL_SEND_TO,
  } = process.env;

  console.log("🚀 Running database backup...");

  const dumpCmd = `"${PG_DUMP_PATH}" -U ${PGUSER} -h ${PGHOST} -p ${PGPORT} -d ${PGDATABASE} -F c -f "${filePath}"`;

  try {
    await execAsync(dumpCmd, { env: { ...process.env, PGPASSWORD } });
    console.log("✅ Backup saved:", filePath);
  } catch (err: any) {
    console.error("❌ pg_dump failed:", err.message);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    tls: {
      rejectUnauthorized: false, // <--- ADD THIS
    },
  });

  try {
    await transporter.sendMail({
      from: EMAIL_USER,
      to: EMAIL_SEND_TO,
      subject: `Daily ${process.env["BUCKUP_FILE_NAME"]} PostgreSQL Backup - ${dateStr}`,
      text: "Attached is your daily backup.",
      attachments: [{ filename: fileName, path: filePath }],
    });

    console.log("📧 Email sent successfully.");
  } catch (err: any) {
    console.error("❌ Email sending failed:", err.message);
  }
}

// -------------------------------
// ▶️ CRON JOB: EVERY DAY at 3AM
// -------------------------------
cron.schedule("0 3 * * *", () => {
  console.log("⏰ Running daily backup...");
  runBackup();
});

// Run immediately on startup to test (optional)
if (process.env["RUN_IMMEDIATELY"] === "true") {
  runBackup();
}

console.log("🟢 Backup service started & cron scheduled.");
