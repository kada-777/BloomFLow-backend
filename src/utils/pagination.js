const { HttpError } = require("./http-error");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function invalidPagination(field, message) {
  throw new HttpError(422, "Validation failed", [{ field, message }]);
}

function parsePositiveInteger(value, field, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    invalidPagination(field, `${field} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    invalidPagination(field, `${field} must be a positive integer`);
  }
  if (maximum && parsed > maximum) {
    invalidPagination(field, `${field} must not exceed ${maximum}`);
  }

  return parsed;
}

function parsePagination(query = {}) {
  const page = parsePositiveInteger(query.page, "page", DEFAULT_PAGE);
  const limit = parsePositiveInteger(query.limit, "limit", DEFAULT_LIMIT, MAX_LIMIT);

  return { page, limit, skip: (page - 1) * limit, take: limit };
}

function buildPagination(page, limit, totalItems) {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

function paginateArray(items, { page, limit }) {
  const totalItems = items.length;
  const start = (page - 1) * limit;

  return {
    data: items.slice(start, start + limit),
    pagination: buildPagination(page, limit, totalItems),
  };
}

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  buildPagination,
  paginateArray,
  parsePagination,
};
