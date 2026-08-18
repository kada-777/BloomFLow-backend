const userService = require("../services/user.service");
const { parsePagination } = require("../utils/pagination");

async function listUsers(req, res) {
  const result = await userService.list(parsePagination(req.query));
  res.json({ success: true, ...result });
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
