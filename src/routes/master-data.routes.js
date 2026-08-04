const express = require("express");
const controller = require("../controllers/master-data.controller");
const { authenticate, authorizeRoles } = require("../middlewares/auth.middleware");

const router = express.Router();
const superadmin = [authenticate, authorizeRoles("SUPERADMIN")];
const farmAndBranchReaders = [authenticate, authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE")];
const flowerReaders = [authenticate, authorizeRoles("SUPERADMIN", "STAFF_HEAD_OFFICE", "STAFF_BRANCH")];

router.get("/farms", ...farmAndBranchReaders, controller.listFarms);
router.post("/farms", ...superadmin, controller.createFarm);
router.patch("/farms/:id", ...superadmin, controller.updateFarm);

router.get("/branches", ...farmAndBranchReaders, controller.listBranches);
router.post("/branches", ...superadmin, controller.createBranch);
router.patch("/branches/:id", ...superadmin, controller.updateBranch);

router.get("/flowers", ...flowerReaders, controller.listFlowers);
router.post("/flowers", ...superadmin, controller.createFlower);
router.patch("/flowers/:id", ...superadmin, controller.updateFlower);

module.exports = router;
