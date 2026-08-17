const receivingService = require("../services/receiving.service");
const { parsePagination } = require("../utils/pagination");

async function listReceivings(req, res) {
  const result = await receivingService.list(
    parsePagination(req.query),
    {
      receivedDate: req.query.receivedDate,
      farmId: req.query.farmId,
      search: req.query.search,
    },
  );
  res.json({ success: true, ...result });
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
