const distributionPlanService = require("../services/distribution-plan.service");
const distributionShipmentService = require("../services/distribution-shipment.service");
const distributionOrderService = require("../services/distribution-order.service");
const { parsePagination } = require("../utils/pagination");

async function listPlans(req, res, next) {
  try {
    const data = await distributionPlanService.list(parsePagination(req.query));
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

async function getPlan(req, res, next) {
  try {
    const data = await distributionPlanService.getById(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function deletePlan(req, res, next) {
  try {
    const data = await distributionPlanService.remove(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function updatePlanItem(req, res, next) {
  try {
    const data = await distributionPlanService.updateItem(
      req.params.planId,
      req.params.itemId,
      req.body ?? {}
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function finalizePlan(req, res, next) {
  try {
    const data = await distributionPlanService.finalize(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function shipPlan(req, res, next) {
  try {
    const data = await distributionShipmentService.shipPlan(req.params.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function createOrders(req, res, next) {
  try {
    const data = await distributionOrderService.createOrders(req.params.id);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { createOrders, deletePlan, finalizePlan, getPlan, listPlans, shipPlan, updatePlanItem };
