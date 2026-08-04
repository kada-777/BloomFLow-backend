const { getHOStock } = require("../services/inventory.service");

async function getHOStockHandler(req, res, next) {
  try {
    const data = await getHOStock();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getHOStock: getHOStockHandler };
