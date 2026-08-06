const { parsePagination, paginateArray } = require("../src/utils/pagination");
const { authorizeRoles } = require("../src/middlewares/auth.middleware");
const { notFound, errorHandler } = require("../src/middlewares/error.middleware");
const { HttpError } = require("../src/utils/http-error");

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe("pagination", () => {
  test("uses page 1 and 10 items by default", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 10, skip: 0, take: 10 });
  });

  test("rejects invalid values and a limit above 100", () => {
    expect(() => parsePagination({ page: "0" })).toThrow(expect.objectContaining({ statusCode: 422 }));
    expect(() => parsePagination({ limit: "101" })).toThrow(expect.objectContaining({ statusCode: 422 }));
  });

  test("returns stable page metadata", () => {
    const result = paginateArray(Array.from({ length: 21 }, (_, index) => index + 1), { page: 2, limit: 10 });

    expect(result.data).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      totalItems: 21,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });
});

describe("API errors", () => {
  test("returns FORBIDDEN for an authenticated role without access", () => {
    const res = response();
    const next = jest.fn();

    authorizeRoles("SUPERADMIN")({ user: { role: "STAFF_BRANCH" } }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  test("returns ROUTE_NOT_FOUND for an unknown API path", () => {
    const res = response();
    notFound({}, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("ROUTE_NOT_FOUND");
  });

  test("returns RESOURCE_NOT_FOUND for a missing entity", () => {
    const res = response();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      errorHandler(new HttpError(404, "Flower not found"), {}, res, jest.fn());
    } finally {
      consoleError.mockRestore();
    }

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("RESOURCE_NOT_FOUND");
  });
});
