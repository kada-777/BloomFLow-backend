const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");

const resources = {
  farm: {
    model: "farm",
    label: "Farm",
    requiredFields: ["name", "location"],
    editableFields: ["name", "location"],
  },
  branch: {
    model: "branch",
    label: "Branch",
    requiredFields: ["name", "location"],
    editableFields: ["name", "location"],
  },
  flower: {
    model: "flower",
    label: "Flower",
    requiredFields: ["name", "variety"],
    editableFields: ["name", "variety"],
  },
};

function getResource(resourceName) {
  const resource = resources[resourceName];

  if (!resource) {
    throw new Error(`Unknown master data resource: ${resourceName}`);
  }

  return resource;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validationError(errors) {
  throw new HttpError(422, "Validation failed", errors);
}

function validateCreatePayload(resourceName, payload) {
  const resource = getResource(resourceName);
  const data = {};
  const errors = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError([{ field: "body", message: "Request body must be an object" }]);
  }

  for (const field of resource.requiredFields) {
    const value = normalizeText(payload[field]);

    if (!value) {
      errors.push({ field, message: `${field} is required` });
    } else {
      data[field] = value;
    }
  }

  if (errors.length) validationError(errors);
  return data;
}

function validateUpdatePayload(resourceName, payload) {
  const resource = getResource(resourceName);
  const errors = [];
  const data = {};

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError([{ field: "body", message: "Request body must be an object" }]);
  }

  for (const field of resource.editableFields) {
    if (!Object.hasOwn(payload, field)) continue;

    const value = normalizeText(payload[field]);
    if (!value) {
      errors.push({ field, message: `${field} cannot be empty` });
    } else {
      data[field] = value;
    }
  }

  if (!Object.keys(data).length && !errors.length) {
    errors.push({ field: "body", message: "At least one editable field is required" });
  }

  if (errors.length) validationError(errors);
  return data;
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    validationError([{ field: "id", message: "id must be a positive integer" }]);
  }
  return id;
}

async function list(resourceName) {
  const resource = getResource(resourceName);
  return prisma[resource.model].findMany({
    orderBy: { name: "asc" },
  });
}

async function create(resourceName, payload) {
  const resource = getResource(resourceName);
  return prisma[resource.model].create({ data: validateCreatePayload(resourceName, payload) });
}

async function update(resourceName, idValue, payload) {
  const resource = getResource(resourceName);
  const id = parseId(idValue);
  const existing = await prisma[resource.model].findUnique({ where: { id } });

  if (!existing) throw new HttpError(404, `${resource.label} not found`);

  return prisma[resource.model].update({
    where: { id },
    data: validateUpdatePayload(resourceName, payload),
  });
}

module.exports = {
  create,
  list,
  update,
  validateCreatePayload,
  validateUpdatePayload,
};
