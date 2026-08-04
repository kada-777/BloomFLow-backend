const userService = require("../services/user.service");

async function listUsers(req, res) {
  const data = await userService.list();
  res.json({ success: true, data });
}

async function createUser(req, res) {
  const data = await userService.create(req.body ?? {});
  res.status(201).json({ success: true, data });
}

async function updateUser(req, res) {
  const data = await userService.update(req.params.id, req.body ?? {});
  res.json({ success: true, data });
}

module.exports = { listUsers, createUser, updateUser };
