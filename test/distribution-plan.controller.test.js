jest.mock("../src/services/distribution-plan.service", () => ({
  getById: jest.fn(),
  list: jest.fn(),
  updateItem: jest.fn(),
  finalize: jest.fn(),
  remove: jest.fn(),
}));
jest.mock("../src/services/distribution-shipment.service", () => ({
  shipPlan: jest.fn(),
}));

const planService = require("../src/services/distribution-plan.service");
const shipmentService = require("../src/services/distribution-shipment.service");
const controller = require("../src/controllers/distribution-plan.controller");

test("finalize controller returns the finalized plan", async () => {
  const data = { id: 2, status: "FINALIZED" };
  planService.finalize.mockResolvedValue(data);
  const response = { json: jest.fn() };

  await controller.finalizePlan({ params: { id: "2" } }, response, jest.fn());

  expect(planService.finalize).toHaveBeenCalledWith("2");
  expect(response.json).toHaveBeenCalledWith({ success: true, data });
});

test("ship controller returns created orders", async () => {
  const data = { planId: 2, orders: [{ orderId: 10, status: "IN_TRANSIT" }] };
  shipmentService.shipPlan.mockResolvedValue(data);
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await controller.shipPlan({ params: { id: "2" } }, response, jest.fn());

  expect(shipmentService.shipPlan).toHaveBeenCalledWith("2");
  expect(response.status).toHaveBeenCalledWith(201);
  expect(response.json).toHaveBeenCalledWith({ success: true, data });
});

test("delete controller returns deleted plan", async () => {
  const data = { id: 2, deleted: true };
  planService.remove.mockResolvedValue(data);
  const response = { json: jest.fn() };

  await controller.deletePlan({ params: { id: "2" } }, response, jest.fn());

  expect(planService.remove).toHaveBeenCalledWith("2");
  expect(response.json).toHaveBeenCalledWith({ success: true, data });
});
