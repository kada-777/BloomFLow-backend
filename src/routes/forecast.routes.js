const express = require("express");
const { generateForecast } = require("../controllers/forecast.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post(
  "/forecasts",
  authenticate,
  authorizeRoles("STAFF_HEAD_OFFICE"),
  generateForecast
);

module.exports = router;
