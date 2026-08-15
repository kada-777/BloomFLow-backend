jest.mock("../src/services/forecast.service", () => ({
  generateForecast: jest.fn(),
  getPlanningMetadata: jest.fn(),
}));

const forecastService = require("../src/services/forecast.service");
const {
  generateForecast,
  getPlanningMetadata,
} = require("../src/controllers/forecast.controller");

test("triggers forecast generation and returns persisted identifiers", async () => {
  forecastService.generateForecast.mockResolvedValue({ forecastRunId: 11, distributionPlanId: 22 });
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await generateForecast(
    {
      body: {
        planningDate: "2025-07-01",
        forecastDate: "2025-06-30",
        modelVersion: "hgb-v1",
        receivingId: 123,
      },
    },
    response,
    jest.fn()
  );

  expect(forecastService.generateForecast).toHaveBeenCalledWith({
    planningDate: "2025-07-01",
    modelVersion: "hgb-v1",
    receivingId: 123,
  });
  expect(response.status).toHaveBeenCalledWith(201);
  expect(response.json).toHaveBeenCalledWith({
    success: true,
    data: { forecastRunId: 11, distributionPlanId: 22 },
  });
});

test("passes receivingId to forecast service", async () => {
  forecastService.generateForecast.mockResolvedValue({ forecastRunId: 11, distributionPlanId: 22 });
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await generateForecast(
    { body: { planningDate: "2025-07-01", modelVersion: "hgb-v1", receivingId: 123 } },
    response,
    jest.fn()
  );

  expect(forecastService.generateForecast).toHaveBeenCalledWith({
    planningDate: "2025-07-01",
    modelVersion: "hgb-v1",
    receivingId: 123,
  });
});

test("returns planning metadata from the forecast service", async () => {
  const metadata = {
    serverDate: "2026-08-15",
    cutoffDate: "2026-08-14",
    minimumPlanningDate: "2026-08-15",
    maximumPlanningDate: "2026-08-17",
    planningDates: [],
    unavailableReason: null,
  };
  forecastService.getPlanningMetadata.mockResolvedValue(metadata);
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await getPlanningMetadata({}, response, jest.fn());

  expect(forecastService.getPlanningMetadata).toHaveBeenCalledWith();
  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith({ success: true, data: metadata });
});
