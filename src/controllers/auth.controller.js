const authService = require("../services/auth.service");

async function login(req, res) {
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
      errors: [
        ...(!email ? [{ field: "email", message: "Email is required" }] : []),
        ...(!password ? [{ field: "password", message: "Password is required" }] : []),
      ],
    });
  }

  const result = await authService.login({ email, password });

  if (!result) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  return res.json({
    success: true,
    data: {
      token: result.token,
      user: result.user,
    },
  });
}

function getCurrentUser(req, res) {
  res.json({
    success: true,
    data: req.user,
  });
}

async function logout(req, res) {
  await authService.logout(req.auth);

  res.json({
    success: true,
    data: { message: "Logged out successfully" },
  });
}

module.exports = { login, getCurrentUser, logout };
