const masterDataService = require("../services/master-data.service");

function listResource(resourceName) {
  return async (req, res) => {
    const data = await masterDataService.list(resourceName);
    res.json({ success: true, data });
  };
}

function createResource(resourceName) {
  return async (req, res) => {
    const data = await masterDataService.create(resourceName, req.body ?? {});
    res.status(201).json({ success: true, data });
  };
}

function updateResource(resourceName) {
  return async (req, res) => {
    const data = await masterDataService.update(resourceName, req.params.id, req.body ?? {});
    res.json({ success: true, data });
  };
}

module.exports = {
  listFarms: listResource("farm"),
  createFarm: createResource("farm"),
  updateFarm: updateResource("farm"),
  listBranches: listResource("branch"),
  createBranch: createResource("branch"),
  updateBranch: updateResource("branch"),
  listFlowers: listResource("flower"),
  createFlower: createResource("flower"),
  updateFlower: updateResource("flower"),
};
