const distributionReceivingService = require("../services/distribution-receiving.service");

async function receiveOrder(req, res, next) {
  try {
    const data = await distributionReceivingService.receive(
      req.params.id,
      req.body ?? {},
      req.user
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { receiveOrder };
