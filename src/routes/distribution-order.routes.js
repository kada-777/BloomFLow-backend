const express = require("express");
const { cancelOrder, getOrder, listOrders, shipOrder } = require("../controllers/distribution-order.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/distributions",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE", "STAFF_BRANCH"),
  listOrders
);

router.get(
  "/distributions/:id",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE", "STAFF_BRANCH"),
  getOrder
);

router.post(
  "/distributions/:id/ship",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  shipOrder
);

router.post(
  "/distributions/:id/cancel",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  cancelOrder
);

module.exports = router;
