const { validateForecastResponse, ForecastResponseError } = require("../src/services/forecast-validation.service");

function validResponse() {
  return {
    cutoffDate: "2025-06-30",
    forecastMethod: "ML",
    modelVersion: "hgb-v1",
    results: [1, 2, 3].map((horizon) => ({
      branchId: 1,
      branchName: "Central",
      flowerId: 2,
      flowerName: "Rose",
      forecastDate: `2025-07-0${horizon}`,
      horizon,
      forecastDemand: 10.5,
      forecastMethod: "ML",
      modelVersion: "hgb-v1",
      generatedAt: "2025-06-30T12:00:00+00:00",
    })),
  };
}

describe("validateForecastResponse", () => {
  test("accepts a complete three-horizon response", () => {
    expect(validateForecastResponse(validResponse())).toEqual(validResponse());
  });

  test("rejects a response with a missing horizon", () => {
    const response = validResponse();
    response.results.pop();

    expect(() => validateForecastResponse(response)).toThrow(ForecastResponseError);
  });

  test("rejects negative forecast demand", () => {
    const response = validResponse();
    response.results[0].forecastDemand = -1;

    expect(() => validateForecastResponse(response)).toThrow(ForecastResponseError);
  });

  test("rejects a row whose metadata disagrees with the response", () => {
    const response = validResponse();
    response.results[1].modelVersion = "different-model";

    expect(() => validateForecastResponse(response)).toThrow(ForecastResponseError);
  });
});
