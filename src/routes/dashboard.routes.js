const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");
const { getHeadOfficeDashboard, getBranchDashboard } = require("../controllers/dashboard.controller");

const router = express.Router();

router.get(
  "/dashboard/head-office",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"),
  getHeadOfficeDashboard,
);

router.get(
  "/dashboard/branch",
  authenticate,
  authorizeRoles("STAFF_BRANCH"),
  getBranchDashboard,
);

module.exports = router;
