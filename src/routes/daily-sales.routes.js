const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");
const {
  listDailySales,
  getDailySale,
  createDailySale,
} = require("../controllers/daily-sales.controller");

const router = express.Router();

router.get(
  "/daily-sales",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE", "STAFF_BRANCH"),
  listDailySales
);

router.get(
  "/daily-sales/:id",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE", "STAFF_BRANCH"),
  getDailySale
);

router.post(
  "/daily-sales",
  authenticate,
  authorizeRoles("STAFF_BRANCH"),
  createDailySale
);

module.exports = router;
