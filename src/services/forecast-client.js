const { forecastServiceUrl, forecastServiceTimeoutMs } = require("../config/env");

class ForecastServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "ForecastServiceError";
    this.statusCode = statusCode;
  }
}

async function requestForecast(payload = {}, { fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), forecastServiceTimeoutMs);

  try {
    const response = await fetchImpl(`${forecastServiceUrl.replace(/\/$/, "")}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ForecastServiceError(
        `Forecast service returned HTTP ${response.status}`,
        response.status
      );
    }

    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ForecastServiceError("Forecast service request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { ForecastServiceError, requestForecast };
