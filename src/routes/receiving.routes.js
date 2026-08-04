const express = require("express");
const { createReceiving, getReceiving, listReceivings } = require("../controllers/receiving.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", authenticate, authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"), listReceivings);
router.post("/", authenticate, authorizeRoles("STAFF_HEAD_OFFICE"), createReceiving);
router.get("/:id", authenticate, authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE"), getReceiving);

module.exports = router;
