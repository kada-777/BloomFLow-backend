require("dotenv/config");

const port = Number(process.env.PORT) || 8000;
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "8h";

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required.");
}

module.exports = { port, jwtSecret, jwtExpiresIn };
