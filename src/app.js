const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const prisma = require("./lib/prisma");
const { notFound, errorHandler } = require("./middlewares/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      message: "Server and database are running",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      success: false,
      message: "Database connection is unavailable",
      database: "disconnected",
    });
  }
});

app.use(routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
