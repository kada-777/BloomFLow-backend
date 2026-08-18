const {
  addDays,
  getPlanningMetadata,
  jakartaDate,
  planningHorizon,
  validatePlanningDate,
} = require("../src/services/planning-date.service");

function expectPlanningDateError(input, message) {
  try {
    validatePlanningDate(input);
    throw new Error("Expected validatePlanningDate to throw");
  } catch (error) {
    expect(error).toMatchObject({
      statusCode: 422,
      message: "Validation failed",
      errors: [{ field: "planningDate", message }],
    });
  }
}

test("uses the Asia/Jakarta calendar date", () => {
  expect(jakartaDate(new Date("2026-08-14T17:30:00.000Z"))).toBe("2026-08-15");
});

test("adds calendar days to a date-only value", () => {
  expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
});

test("calculates horizon from calendar dates", () => {
  expect(planningHorizon("2026-08-12", "2026-08-15")).toBe(3);
});

test.each([undefined, "", "2026/08/15", "2026-8-15", "2026-02-30"])(
  "rejects missing, malformed, or impossible planning date %p",
  (planningDate) => {
    expectPlanningDateError(
      {
        planningDate,
        cutoffDate: "2026-08-12",
        serverDate: "2026-08-14",
      },
      "planningDate must use YYYY-MM-DD"
    );
  }
);

test.each([
  ["2026-08-13", "2026-08-14", "planningDate cannot be before the server date"],
  ["2026-08-11", "2026-08-10", "planningDate must be after the Daily Sales cutoff"],
  ["2026-08-12", "2026-08-10", "planningDate must be after the Daily Sales cutoff"],
  ["2026-08-16", "2026-08-14", "planningDate must be within forecast horizon 1-3"],
])("rejects invalid planning date %s", (planningDate, serverDate, message) => {
  expectPlanningDateError(
    {
      planningDate,
      cutoffDate: "2026-08-12",
      serverDate,
    },
    message
  );
});

test("returns normalized data for a valid planning date", () => {
  expect(
    validatePlanningDate({
      planningDate: "2026-08-15",
      cutoffDate: "2026-08-12",
      serverDate: "2026-08-14",
    })
  ).toEqual({
    planningDate: "2026-08-15",
    planningDateValue: new Date("2026-08-15T00:00:00.000Z"),
    horizon: 3,
  });
});

function metadataDependencies({ sales = [], plans = [], instant = "2026-08-14T05:00:00.000Z" } = {}) {
  return {
    prismaClient: {
      dailySale: { findMany: jest.fn().mockResolvedValue(sales) },
      distributionPlan: { findMany: jest.fn().mockResolvedValue(plans) },
    },
    now: () => new Date(instant),
  };
}

test("returns valid dates and disables dates with existing plans", async () => {
  const dependencies = metadataDependencies({
    sales: [{ salesDate: new Date("2026-08-11T00:00:00.000Z") }, { salesDate: "2026-08-12" }],
    plans: [{ planningDate: "2026-08-14" }],
  });

  await expect(getPlanningMetadata(dependencies)).resolves.toEqual({
    serverDate: "2026-08-14",
    cutoffDate: "2026-08-12",
    minimumPlanningDate: "2026-08-14",
    maximumPlanningDate: "2026-08-15",
    planningDates: [
      { date: "2026-08-14", horizon: 2, available: false, reason: "PLAN_ALREADY_EXISTS" },
      { date: "2026-08-15", horizon: 3, available: true, reason: null },
    ],
    unavailableReason: null,
  });
  expect(dependencies.prismaClient.dailySale.findMany).toHaveBeenCalledWith({ select: { salesDate: true } });
  expect(dependencies.prismaClient.distributionPlan.findMany).toHaveBeenCalledWith({
    where: {
      planningDate: {
        gte: new Date("2026-08-14T00:00:00.000Z"),
        lte: new Date("2026-08-15T00:00:00.000Z"),
      },
    },
    select: { planningDate: true },
  });
});

test("reports outdated sales when today is beyond the forecast range", async () => {
  const dependencies = metadataDependencies({
    sales: [{ salesDate: "2026-08-12" }],
    instant: "2026-08-16T05:00:00.000Z",
  });

  await expect(getPlanningMetadata(dependencies)).resolves.toEqual({
    serverDate: "2026-08-16",
    cutoffDate: "2026-08-12",
    minimumPlanningDate: "2026-08-16",
    maximumPlanningDate: "2026-08-15",
    planningDates: [],
    unavailableReason: "SALES_DATA_OUTDATED",
  });
  expect(dependencies.prismaClient.distributionPlan.findMany).not.toHaveBeenCalled();
});

test("reports when all dates in the temporal range already have plans", async () => {
  const dependencies = metadataDependencies({
    sales: [{ salesDate: "2026-08-12" }],
    plans: [
      { planningDate: new Date("2026-08-14T00:00:00.000Z") },
      { planningDate: new Date("2026-08-15T00:00:00.000Z") },
    ],
  });

  const metadata = await getPlanningMetadata(dependencies);

  expect(metadata.planningDates).toEqual([
    { date: "2026-08-14", horizon: 2, available: false, reason: "PLAN_ALREADY_EXISTS" },
    { date: "2026-08-15", horizon: 3, available: false, reason: "PLAN_ALREADY_EXISTS" },
  ]);
  expect(metadata.unavailableReason).toBe("ALL_DATES_HAVE_PLANS");
});

test("requires Daily Sales before offering planning dates", async () => {
  const dependencies = metadataDependencies();

  await expect(getPlanningMetadata(dependencies)).resolves.toEqual({
    serverDate: "2026-08-14",
    cutoffDate: null,
    minimumPlanningDate: null,
    maximumPlanningDate: null,
    planningDates: [],
    unavailableReason: "DAILY_SALES_REQUIRED",
  });
  expect(dependencies.prismaClient.distributionPlan.findMany).not.toHaveBeenCalled();
});
