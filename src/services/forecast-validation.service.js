const allowedForecastMethods = new Set(["ML", "BASELINE"]);

class ForecastResponseError extends Error {
  constructor(errors) {
    super("Forecast service returned an invalid response");
    this.name = "ForecastResponseError";
    this.statusCode = 502;
    this.code = "FORECAST_RESPONSE_INVALID";
    this.errors = errors;
  }
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function expectedForecastDate(cutoffDate, horizon) {
  const date = new Date(`${cutoffDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + horizon);
  return date.toISOString().slice(0, 10);
}

function parsePositiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseDemand(value) {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;

  const demand = Number(value);
  return Number.isFinite(demand) && demand >= 0 ? demand : undefined;
}

function validateForecastResponse(response) {
  const errors = [];

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new ForecastResponseError([{ field: "body", message: "response must be an object" }]);
  }

  if (!isValidDate(response.cutoffDate)) {
    errors.push({ field: "cutoffDate", message: "cutoffDate must use YYYY-MM-DD" });
  }
  if (!allowedForecastMethods.has(response.forecastMethod)) {
    errors.push({ field: "forecastMethod", message: "forecastMethod is invalid" });
  }
  if (typeof response.modelVersion !== "string" || !response.modelVersion.trim()) {
    errors.push({ field: "modelVersion", message: "modelVersion is required" });
  }
  if (!Array.isArray(response.results) || !response.results.length) {
    errors.push({ field: "results", message: "results must contain at least one row" });
  }

  if (errors.length) throw new ForecastResponseError(errors);

  const combinations = new Map();
  const results = response.results.map((row, index) => {
    const prefix = `results[${index}]`;
    const rowErrors = [];
    const branchId = parsePositiveInteger(row?.branchId);
    const flowerId = parsePositiveInteger(row?.flowerId);
    const horizon = parsePositiveInteger(row?.horizon);
    const forecastDemand = parseDemand(row?.forecastDemand);

    if (!branchId) rowErrors.push({ field: `${prefix}.branchId`, message: "branchId must be positive" });
    if (!flowerId) rowErrors.push({ field: `${prefix}.flowerId`, message: "flowerId must be positive" });
    if (![1, 2, 3].includes(horizon)) rowErrors.push({ field: `${prefix}.horizon`, message: "horizon must be 1, 2, or 3" });
    if (forecastDemand === undefined) rowErrors.push({ field: `${prefix}.forecastDemand`, message: "forecastDemand must be non-negative" });
    if (typeof row?.branchName !== "string" || !row.branchName.trim()) rowErrors.push({ field: `${prefix}.branchName`, message: "branchName is required" });
    if (typeof row?.flowerName !== "string" || !row.flowerName.trim()) rowErrors.push({ field: `${prefix}.flowerName`, message: "flowerName is required" });
    if (!isValidDate(row?.forecastDate)) rowErrors.push({ field: `${prefix}.forecastDate`, message: "forecastDate must use YYYY-MM-DD" });
    if (row?.forecastMethod !== response.forecastMethod) rowErrors.push({ field: `${prefix}.forecastMethod`, message: "forecastMethod does not match response" });
    if (row?.modelVersion !== response.modelVersion) rowErrors.push({ field: `${prefix}.modelVersion`, message: "modelVersion does not match response" });
    if (typeof row?.modelName !== "string" || !row.modelName.trim()) rowErrors.push({ field: `${prefix}.modelName`, message: "modelName is required" });
    if (typeof row?.generatedAt !== "string" || Number.isNaN(Date.parse(row.generatedAt))) rowErrors.push({ field: `${prefix}.generatedAt`, message: "generatedAt must be a valid timestamp" });

    if (!rowErrors.length) {
      if (row.forecastDate !== expectedForecastDate(response.cutoffDate, horizon)) {
        rowErrors.push({ field: `${prefix}.forecastDate`, message: "forecastDate does not match cutoffDate and horizon" });
      }

      const key = `${branchId}:${flowerId}`;
      const horizons = combinations.get(key) ?? new Set();
      if (horizons.has(horizon)) {
        rowErrors.push({ field: prefix, message: "duplicate branchId, flowerId, and horizon" });
      }
      horizons.add(horizon);
      combinations.set(key, horizons);
    }

    if (rowErrors.length) errors.push(...rowErrors);

    return { ...row, branchId, flowerId, horizon, forecastDemand };
  });

  for (const [key, horizons] of combinations) {
    if (horizons.size !== 3) {
      errors.push({ field: key, message: "each branch and flower must have horizons 1, 2, and 3" });
    }
  }

  if (errors.length) throw new ForecastResponseError(errors);

  return { ...response, results };
}

module.exports = { ForecastResponseError, validateForecastResponse };
