const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");
const { getHeadOfficeDashboard } = require("../controllers/dashboard.controller");

const router = express.Router();

router.get(
  "/dashboard/head-office",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE", "STAFF_BRANCH"),
  getHeadOfficeDashboard,
);

module.exports = router;
