const express = require("express");
const {
  generateForecast,
  getPlanningMetadata,
} = require("../controllers/forecast.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get(
  "/forecasts/planning-metadata",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  getPlanningMetadata
);

router.post(
  "/forecasts",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  generateForecast
);

module.exports = router;
