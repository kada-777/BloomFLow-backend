const { getHeadOfficeDashboard, getBranchDashboard } = require("../services/dashboard.service");

async function getHeadOfficeDashboardHandler(req, res, next) {
  try {
    const data = await getHeadOfficeDashboard(
      req.query.days || "today",
      req.query.activityPage || 1,
      req.query.activityLimit || 10,
      req.user.role === "STAFF_BRANCH" ? req.user.branchId : req.query.branchId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { getHeadOfficeDashboard: getHeadOfficeDashboardHandler };

async function getBranchDashboardHandler(req, res, next) {
  try {
    const data = await getBranchDashboard(
      req.query.days || "today",
      req.query.activityPage || 1,
      req.query.activityLimit || 10,
      req.user.branchId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports.getBranchDashboard = getBranchDashboardHandler;
