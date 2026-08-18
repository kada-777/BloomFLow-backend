require("dotenv/config");

const port = Number(process.env.PORT) || 8000;
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "8h";
const forecastServiceUrl = process.env.FORECAST_SERVICE_URL || "http://127.0.0.1:8001";
const forecastServiceTimeoutMs = Number(process.env.FORECAST_SERVICE_TIMEOUT_MS) || 120000;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required.");
}

module.exports = {
  port,
  jwtSecret,
  jwtExpiresIn,
  forecastServiceUrl,
  forecastServiceTimeoutMs,
};
