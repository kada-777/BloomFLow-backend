const dailySalesService = require("../services/daily-sales.service");
const { parsePagination } = require("../utils/pagination");

async function listDailySales(req, res, next) {
  try {
    const branchId = req.user.role === "STAFF_BRANCH" ? req.user.branchId : undefined;
    const result = await dailySalesService.list(branchId, parsePagination(req.query), req.query.sort);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getDailySale(req, res, next) {
  try {
    const branchId = req.user.role === "STAFF_BRANCH" ? req.user.branchId : undefined;
    const data = await dailySalesService.getById(req.params.id, branchId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function createDailySale(req, res, next) {
  try {
    const branchId = req.user.branchId;
    const data = await dailySalesService.create(branchId, req.body ?? {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { listDailySales, getDailySale, createDailySale };
