const express = require("express");
const {
  finalizePlan,
  getPlan,
  listPlans,
  createOrders,
  updatePlanItem,
} = require("../controllers/distribution-plan.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/distribution-plans",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"),
  listPlans
);
router.get(
  "/distribution-plans/:id",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"),
  getPlan
);
router.patch(
  "/distribution-plans/:planId/items/:itemId",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  updatePlanItem
);
router.post(
  "/distribution-plans/:id/finalize",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  finalizePlan
);
router.post(
  "/distribution-plans/:id/create-orders",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  createOrders
);

module.exports = router;
