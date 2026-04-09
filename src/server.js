require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const errorMiddleware = require("./middleware/errorMiddleware");

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/projects", require("./routes/projectRoutes"));
app.use("/api/accounts", require("./routes/accountRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
// NEW: Partner routes
app.use("/api/partners", require("./routes/partnerRoutes"));

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "🏗️ Contractor Finance API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth/login",
      projects: "/api/projects",
      accounts: "/api/accounts",
      categories: "/api/categories",
      transactions: "/api/transactions",
      reports: "/api/reports",
      partners: "/api/partners" // Added partners endpoint
    }
  });
});

// Error middleware (should be last)
app.use(errorMiddleware);

// Handle 404
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Login with: username: admin, password: admin123`);
});
