const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");
const {
  getHOStock,
  getBranchStock,
  getMyBranchStock,
} = require("../controllers/inventory.controller");

const router = express.Router();

router.get(
  "/inventory/head-office",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"),
  getHOStock
);

router.get(
  "/inventory/branches",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"),
  getBranchStock
);

router.get(
  "/inventory/my-branch",
  authenticate,
  authorizeRoles("STAFF_BRANCH"),
  getMyBranchStock
);

module.exports = router;
