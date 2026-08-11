const distributionOrderService = require("../services/distribution-order.service");
const distributionShipmentService = require("../services/distribution-shipment.service");

async function getOrder(req, res, next) {
  try {
    const data = await distributionOrderService.getById(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function shipOrder(req, res, next) {
  try {
    const data = await distributionShipmentService.shipOrder(req.params.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function cancelOrder(req, res, next) {
  try {
    const data = await distributionOrderService.cancel(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { cancelOrder, getOrder, shipOrder };
