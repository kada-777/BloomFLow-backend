const { getHeadOfficeDashboard } = require("../services/dashboard.service");

async function getHeadOfficeDashboardHandler(req, res, next) {
  try {
    const data = await getHeadOfficeDashboard(
      req.query.days || 7,
      req.query.activityPage || 1,
      req.query.activityLimit || 10,
      req.query.branchId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { getHeadOfficeDashboard: getHeadOfficeDashboardHandler };
