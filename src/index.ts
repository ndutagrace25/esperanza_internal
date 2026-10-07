import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { startPaymentReminderCron } from "./jobs/paymentReminderCron.js";
import { startPaymentExtensionReminderCron } from "./jobs/paymentExtensionReminderCron.js";
import { startSmsBalanceCron } from "./jobs/smsBalanceCron.js";

const app = express();

// CORS configuration
const corsOptions = {
  origin:
    env.NODE_ENV === "production"
      ? process.env["CORS_ORIGIN"]?.split(",") || "*" // Allow specific origins in production
      : true, // Allow all origins in development
  credentials: true, // Allow cookies/auth headers
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api", routes);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
app.listen(env.PORT, () => {
  console.log("🚀 Server starting...");
  console.log(`📦 Environment: ${env.NODE_ENV}`);
  console.log(`🌐 Server running on http://localhost:${env.PORT}`);
  console.log(
    `🗄️  Database: ${env.DATABASE_URL ? "Configured" : "Not configured"}`
  );
  // Payment reminder SMS: 1st, 2nd, 3rd of every month at 8:00 AM (Africa/Nairobi)
  startPaymentReminderCron();
  // Payment extension reminder: daily at 8:00 AM for sales with extension due in 1–3 days
  startPaymentExtensionReminderCron();
  // SMS credit check: daily at 8:00 AM, alerts directors when credit is low
  startSmsBalanceCron();
});
