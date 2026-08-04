const express = require("express");
const { listUsers, createUser, updateUser } = require("../controllers/user.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate, authorizeRoles("SUPERADMIN"));
router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:id", updateUser);

module.exports = router;
