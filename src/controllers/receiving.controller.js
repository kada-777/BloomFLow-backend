const receivingService = require("../services/receiving.service");

async function listReceivings(req, res) {
  const data = await receivingService.list();
  res.json({ success: true, data });
}

async function getReceiving(req, res) {
  const data = await receivingService.getById(req.params.id);
  res.json({ success: true, data });
}

async function createReceiving(req, res) {
  const data = await receivingService.create(req.body ?? {});
  res.status(201).json({ success: true, data });
}

module.exports = { createReceiving, getReceiving, listReceivings };
