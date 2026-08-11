const forecastService = require("../services/forecast.service");

async function generateForecast(req, res, next) {
  try {
    const data = await forecastService.generateForecast({
      forecastDate: req.body?.forecastDate,
      modelVersion: req.body?.modelVersion,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = { generateForecast };
