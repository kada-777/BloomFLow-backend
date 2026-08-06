const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { HttpError } = require("../utils/http-error");
const { buildPagination } = require("../utils/pagination");

const userRoles = ["SUPERADMIN", "STAFF_HEAD_OFFICE", "STAFF_BRANCH"];
const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  branchId: true,
  isActive: true,
  branch: {
    select: {
      id: true,
      name: true,
    },
  },
};

function validationError(errors) {
  throw new HttpError(422, "Validation failed", errors);
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePassword(value) {
  return typeof value === "string" ? value : "";
}

function parseBranchId(value, errors) {
  if (value === null) return null;

  const branchId = Number(value);
  if (!Number.isInteger(branchId) || branchId < 1) {
    errors.push({ field: "branchId", message: "branchId must be a positive integer" });
    return undefined;
  }

  return branchId;
}

function validateRole(value, errors) {
  if (!userRoles.includes(value)) {
    errors.push({ field: "role", message: "role is invalid" });
    return undefined;
  }

  return value;
}

function validateCreatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError([{ field: "body", message: "Request body must be an object" }]);
  }

  const errors = [];
  const email = normalizeEmail(payload.email);
  const password = normalizePassword(payload.password);
  const role = validateRole(payload.role, errors);
  const branchId = Object.hasOwn(payload, "branchId") ? parseBranchId(payload.branchId, errors) : null;

  if (!email) errors.push({ field: "email", message: "email is required" });
  if (!password) errors.push({ field: "password", message: "password is required" });
  if (role === "STAFF_BRANCH" && !branchId) {
    errors.push({ field: "branchId", message: "branchId is required for STAFF_BRANCH" });
  }
  if (role && role !== "STAFF_BRANCH" && branchId) {
    errors.push({ field: "branchId", message: "branchId is only allowed for STAFF_BRANCH" });
  }

  if (errors.length) validationError(errors);
  return { email, password, role, branchId };
}

function validateUpdatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError([{ field: "body", message: "Request body must be an object" }]);
  }

  const errors = [];
  const data = {};
  const allowedFields = ["isActive", "password", "role", "branchId"];
  const unsupportedFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));

  for (const field of unsupportedFields) {
    errors.push({ field, message: "field is not supported" });
  }

  if (Object.hasOwn(payload, "isActive")) {
    if (typeof payload.isActive !== "boolean") {
      errors.push({ field: "isActive", message: "isActive must be a boolean" });
    } else {
      data.isActive = payload.isActive;
    }
  }

  if (Object.hasOwn(payload, "password")) {
    const password = normalizePassword(payload.password);
    if (!password) {
      errors.push({ field: "password", message: "password cannot be empty" });
    } else {
      data.password = password;
    }
  }

  if (Object.hasOwn(payload, "role")) {
    data.role = validateRole(payload.role, errors);
  }

  if (Object.hasOwn(payload, "branchId")) {
    data.branchId = parseBranchId(payload.branchId, errors);
  }

  if (!Object.keys(data).length && !errors.length) {
    errors.push({ field: "body", message: "At least one supported field is required" });
  }

  if (errors.length) validationError(errors);
  return data;
}

async function ensureValidBranch(branchId) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) {
    throw new HttpError(422, "Validation failed", [{ field: "branchId", message: "branchId is invalid" }]);
  }
}

async function list(pagination) {
  const [data, totalItems] = await prisma.$transaction([
    prisma.user.findMany({
      select: publicUserSelect,
      orderBy: { email: "asc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.user.count(),
  ]);

  return { data, pagination: buildPagination(pagination.page, pagination.limit, totalItems) };
}

async function create(payload) {
  const data = validateCreatePayload(payload);

  if (data.role === "STAFF_BRANCH") await ensureValidBranch(data.branchId);

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    throw new HttpError(422, "Validation failed", [{ field: "email", message: "email is already registered" }]);
  }

  return prisma.user.create({
    data: {
      email: data.email,
      password: await bcrypt.hash(data.password, 12),
      role: data.role,
      branchId: data.branchId,
    },
    select: publicUserSelect,
  });
}

async function update(idValue, payload) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id < 1) {
    validationError([{ field: "id", message: "id must be a positive integer" }]);
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, branchId: true },
  });
  if (!existing) throw new HttpError(404, "User not found");

  const data = validateUpdatePayload(payload);
  const nextRole = data.role ?? existing.role;
  const nextBranchId = Object.hasOwn(data, "branchId") ? data.branchId : existing.branchId;

  if (nextRole === "STAFF_BRANCH") {
    if (!nextBranchId) {
      validationError([{ field: "branchId", message: "branchId is required for STAFF_BRANCH" }]);
    }
    await ensureValidBranch(nextBranchId);
  } else {
    data.branchId = null;
  }

  if (data.password) data.password = await bcrypt.hash(data.password, 12);

  return prisma.user.update({
    where: { id },
    data,
    select: publicUserSelect,
  });
}

module.exports = { create, list, normalizeEmail, update, validateCreatePayload, validateUpdatePayload };
