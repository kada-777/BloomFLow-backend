const configurationService = require("../services/configuration.service");

async function listConfigurations(req, res) {
  const data = await configurationService.list();
  res.json({ success: true, data });
}

async function updateConfiguration(req, res) {
  const data = await configurationService.update(req.params.key, req.body?.value, req.user.id);
  res.json({ success: true, data });
}

module.exports = { listConfigurations, updateConfiguration };
