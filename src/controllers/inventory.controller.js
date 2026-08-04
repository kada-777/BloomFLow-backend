const { getHOStock, getBranchStock, getMyBranchStock } = require("../services/inventory.service");

async function getHOStockHandler(req, res, next) {
  try {
    const data = await getHOStock();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getBranchStockHandler(req, res, next) {
  try {
    const data = await getBranchStock();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getMyBranchStockHandler(req, res, next) {
  try {
    const branchId = req.user.branchId;
    const data = await getMyBranchStock(branchId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHOStock: getHOStockHandler,
  getBranchStock: getBranchStockHandler,
  getMyBranchStock: getMyBranchStockHandler,
};
