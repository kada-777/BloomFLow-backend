const express = require("express");
const { getHome } = require("../controllers/health.controller");

const router = express.Router();

router.get("/", getHome);

module.exports = router;
