const express = require("express");
const { listConfigurations, updateConfiguration } = require("../controllers/configuration.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate, authorizeRoles("SUPERADMIN"));
router.get("/", listConfigurations);
router.patch("/:key", updateConfiguration);

module.exports = router;
