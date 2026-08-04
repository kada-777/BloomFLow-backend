const { calculateFlowerStatus, DEFAULT_FRESH_PERIOD, DEFAULT_GRADE_C_PERIOD } = require("../src/utils/flower-status");

describe("calculateFlowerStatus", () => {
  const freshPeriod = DEFAULT_FRESH_PERIOD;
  const gradeCPeriod = DEFAULT_GRADE_C_PERIOD;

  function daysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  test("returns FRESH for day 0 to freshPeriod-1", () => {
    expect(calculateFlowerStatus(daysAgo(0), freshPeriod, gradeCPeriod)).toBe("FRESH");
    expect(calculateFlowerStatus(daysAgo(3), freshPeriod, gradeCPeriod)).toBe("FRESH");
    expect(calculateFlowerStatus(daysAgo(6), freshPeriod, gradeCPeriod)).toBe("FRESH");
  });

  test("returns GRADE_C for freshPeriod to freshPeriod+gradeCPeriod-1", () => {
    expect(calculateFlowerStatus(daysAgo(7), freshPeriod, gradeCPeriod)).toBe("GRADE_C");
    expect(calculateFlowerStatus(daysAgo(9), freshPeriod, gradeCPeriod)).toBe("GRADE_C");
    expect(calculateFlowerStatus(daysAgo(10), freshPeriod, gradeCPeriod)).toBe("GRADE_C");
  });

  test("returns DAMAGED after freshPeriod+gradeCPeriod", () => {
    expect(calculateFlowerStatus(daysAgo(11), freshPeriod, gradeCPeriod)).toBe("DAMAGED");
    expect(calculateFlowerStatus(daysAgo(15), freshPeriod, gradeCPeriod)).toBe("DAMAGED");
    expect(calculateFlowerStatus(daysAgo(30), freshPeriod, gradeCPeriod)).toBe("DAMAGED");
  });

  test("respects custom periods", () => {
    const customFresh = 3;
    const customGradeC = 2;

    expect(calculateFlowerStatus(daysAgo(0), customFresh, customGradeC)).toBe("FRESH");
    expect(calculateFlowerStatus(daysAgo(2), customFresh, customGradeC)).toBe("FRESH");
    expect(calculateFlowerStatus(daysAgo(3), customFresh, customGradeC)).toBe("GRADE_C");
    expect(calculateFlowerStatus(daysAgo(4), customFresh, customGradeC)).toBe("GRADE_C");
    expect(calculateFlowerStatus(daysAgo(5), customFresh, customGradeC)).toBe("DAMAGED");
  });

  test("handles Date string input", () => {
    const dateStr = daysAgo(2).toISOString();
    expect(calculateFlowerStatus(dateStr, freshPeriod, gradeCPeriod)).toBe("FRESH");
  });
});
