const { AuthenticationError, authenticateToken } = require("../services/auth.service");

function unauthorized(res, message) {
  return res.status(401).json({
    success: false,
    message,
  });
}

function forbidden(res) {
  return res.status(403).json({
    success: false,
    message: "You do not have permission to access this resource",
  });
}

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return unauthorized(res, "Authentication token is required");
  }

  try {
    const token = authorization.slice("Bearer ".length);
    const authenticated = await authenticateToken(token);

    req.user = authenticated.user;
    req.auth = authenticated.auth;

    return next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return unauthorized(res, error.message);
    }

    return next(error);
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return unauthorized(res, "Authentication token is required");
    }

    if (!allowedRoles.includes(req.user.role)) {
      return forbidden(res);
    }

    return next();
  };
}

module.exports = { authenticate, authorizeRoles };
