const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");
const { getHeadOfficeDashboard } = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/dashboard/head-office", authenticate, authorizeRoles("STAFF_HEAD_OFFICE"), getHeadOfficeDashboard);

module.exports = router;
