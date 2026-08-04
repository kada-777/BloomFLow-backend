const express = require("express");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");
const { getHOStock } = require("../controllers/inventory.controller");

const router = express.Router();

router.get(
  "/inventory/head-office",
  authenticate,
  authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"),
  getHOStock
);

module.exports = router;
