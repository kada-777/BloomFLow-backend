const app = require("./app");
const { port } = require("./config/env");
const prisma = require("./lib/prisma");

async function startServer() {
  try {
    await prisma.$connect();
    console.log("Database connected.");

    app.listen(port, () => {
      console.log(`Server berjalan di http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
}

startServer();
