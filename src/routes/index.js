const express = require("express");
const { getHome } = require("../controllers/health.controller");
const authRoutes = require("./auth.routes");
const masterDataRoutes = require("./master-data.routes");
const userRoutes = require("./user.routes");
const configurationRoutes = require("./configuration.routes");
const receivingRoutes = require("./receiving.routes");
const inventoryRoutes = require("./inventory.routes");

const router = express.Router();

router.get("/", getHome);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/configurations", configurationRoutes);
router.use("/receivings", receivingRoutes);
router.use(inventoryRoutes);
router.use(masterDataRoutes);

module.exports = router;
