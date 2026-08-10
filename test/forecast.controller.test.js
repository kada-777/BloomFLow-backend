jest.mock("../src/services/forecast.service", () => ({
  generateForecast: jest.fn(),
}));

const forecastService = require("../src/services/forecast.service");
const { generateForecast } = require("../src/controllers/forecast.controller");

test("triggers forecast generation and returns persisted identifiers", async () => {
  forecastService.generateForecast.mockResolvedValue({ forecastRunId: 11, distributionPlanId: 22 });
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await generateForecast(
    { body: { forecastDate: "2025-06-30", modelVersion: "hgb-v1" } },
    response,
    jest.fn()
  );

  expect(forecastService.generateForecast).toHaveBeenCalledWith({
    forecastDate: "2025-06-30",
    modelVersion: "hgb-v1",
  });
  expect(response.status).toHaveBeenCalledWith(201);
  expect(response.json).toHaveBeenCalledWith({
    success: true,
    data: { forecastRunId: 11, distributionPlanId: 22 },
  });
});
