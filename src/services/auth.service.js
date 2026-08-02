const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const prisma = require("../lib/prisma");
const { jwtSecret, jwtExpiresIn } = require("../config/env");

class AuthenticationError extends Error {}

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
  };
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
      branchId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
    return null;
  }

  const token = jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      branchId: user.branchId,
    },
    jwtSecret,
    {
      expiresIn: jwtExpiresIn,
      jwtid: randomUUID(),
    },
  );

  return {
    token,
    user: toPublicUser(user),
  };
}

async function authenticateToken(token) {
  let payload;

  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new AuthenticationError("Authentication token has expired");
    }

    throw new AuthenticationError("Invalid authentication token");
  }

  const userId = Number(payload.sub);

  if (!Number.isInteger(userId) || typeof payload.jti !== "string" || typeof payload.exp !== "number") {
    throw new AuthenticationError("Invalid authentication token");
  }

  const blacklistedToken = await prisma.tokenBlacklist.findUnique({
    where: { jti: payload.jti },
  });

  if (blacklistedToken) {
    throw new AuthenticationError("Authentication token has been revoked");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      branchId: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new AuthenticationError("User account is unavailable");
  }

  return {
    user: toPublicUser(user),
    auth: {
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    },
  };
}

async function logout({ jti, expiresAt }) {
  await prisma.tokenBlacklist.upsert({
    where: { jti },
    update: { expiresAt },
    create: { jti, expiresAt },
  });
}

module.exports = { AuthenticationError, login, authenticateToken, logout };
