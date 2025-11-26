import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import routes from "./routes/index.js";

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
});
