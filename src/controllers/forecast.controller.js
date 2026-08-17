const forecastService = require("../services/forecast.service");

async function generateForecast(req, res, next) {
  try {
    const data = await forecastService.generateForecast({
      planningDate: req.body?.planningDate,
      modelVersion: req.body?.modelVersion,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getPlanningMetadata(req, res, next) {
  try {
    const data = await forecastService.getPlanningMetadata();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { generateForecast, getPlanningMetadata };
