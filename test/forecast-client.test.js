process.env.JWT_SECRET = "test-secret";
process.env.FORECAST_SERVICE_URL = "http://forecast.test";
process.env.FORECAST_SERVICE_TIMEOUT_MS = "30000";

const { requestForecast } = require("../src/services/forecast-client");

describe("requestForecast", () => {
  test("posts the forecast request to the configured service", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cutoffDate: "2025-06-30", results: [] }),
    });

    await requestForecast(
      { forecastDate: "2025-06-30", modelVersion: "hgb-v1" },
      { fetchImpl }
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://forecast.test/forecast",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forecastDate: "2025-06-30", modelVersion: "hgb-v1" }),
      })
    );
  });
});
