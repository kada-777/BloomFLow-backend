const express = require("express");
const { receiveOrder } = require("../controllers/distribution-receiving.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.post(
  "/distributions/:id/receive",
  authenticate,
  authorizeRoles("STAFF_BRANCH"),
  receiveOrder
);

module.exports = router;
