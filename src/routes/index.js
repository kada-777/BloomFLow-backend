const express = require("express");
const { getHome } = require("../controllers/health.controller");
const authRoutes = require("./auth.routes");

const router = express.Router();

router.get("/", getHome);
router.use("/auth", authRoutes);

module.exports = router;
