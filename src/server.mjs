// import dns from "node:dns";
// dns.setServers(["1.1.1.1", "8.8.8.8"]);

import "dotenv/config";
import express from "express";
import cors from "cors";
import serverless from "serverless-http"; // Added for serverless
import connectDB from "./src/config/db.js";
import { notFound, errorHandler } from "./src/middleware/errorHandler.js";

import authRoutes from "./src/routes/authRoutes.js";
import productRoutes from "./src/routes/productRoutes.js";
import orderRoutes from "./src/routes/orderRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import dashboardRoutes from "./src/routes/dashboardRoutes.js";
import shopRoutes from "./src/routes/shopRoutes.js";
import settingRoutes from "./src/routes/settingRoutes.js";

const app = express();

// CORS — allow all origins from CLIENT_URL (comma-separated) or any in production proxy
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Health
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "API is running" });
});

app.get("/", (req, res) => {
  res.json({ success: true, message: "Mughal Store API is working" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/store", settingRoutes);

app.use(notFound);
app.use(errorHandler);

// Export handler for Netlify
export const handler = serverless(app);
const PORT = process.env.PORT || 4000;

// Connect DB on serverless execution
const startServer = async () => {
  try {
    await connectDB();
    if (process.env.NODE_ENV !== "production" || !process.env.NETLIFY) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on port ${PORT}`);
      });
    }
  } catch (error) {
    console.error("Failed to start server:", error.message);
  }
};

startServer();

export default app;