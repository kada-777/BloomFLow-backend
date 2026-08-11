jest.mock("../src/services/distribution-order.service", () => ({
  getById: jest.fn(),
}));

const orderService = require("../src/services/distribution-order.service");
const controller = require("../src/controllers/distribution-order.controller");

test("returns the distribution order", async () => {
  const data = { id: 11, status: "IN_TRANSIT" };
  orderService.getById.mockResolvedValue(data);
  const response = { json: jest.fn() };
  const user = { role: "STAFF_BRANCH", branchId: 7 };

  await controller.getOrder({ params: { id: "11" }, user }, response, jest.fn());

  expect(orderService.getById).toHaveBeenCalledWith("11", user);
  expect(response.json).toHaveBeenCalledWith({ success: true, data });
});
