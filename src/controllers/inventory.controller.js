const {
  getHOStock,
  getBranchStock,
  getMyBranchStock,
  getMyBranchFlowerDetail,
} = require("../services/inventory.service");
const { parsePagination } = require("../utils/pagination");

async function getHOStockHandler(req, res, next) {
  try {
    const result = await getHOStock(parsePagination(req.query));
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getBranchStockHandler(req, res, next) {
  try {
    const result = await getBranchStock(parsePagination(req.query));
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getMyBranchStockHandler(req, res, next) {
  try {
    const branchId = req.user.branchId;
    const result = await getMyBranchStock(branchId, parsePagination(req.query));
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getMyBranchFlowerDetailHandler(req, res, next) {
  try {
    const branchId = req.user.branchId;
    const data = await getMyBranchFlowerDetail(branchId, req.params.flowerId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHOStock: getHOStockHandler,
  getBranchStock: getBranchStockHandler,
  getMyBranchStock: getMyBranchStockHandler,
  getMyBranchFlowerDetail: getMyBranchFlowerDetailHandler,
};
