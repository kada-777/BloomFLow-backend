jest.mock("../src/services/distribution-order.service", () => ({
  getById: jest.fn(),
  list: jest.fn(),
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

test("returns the paginated distribution order list", async () => {
  const data = { data: [{ id: 11 }], pagination: { page: 1 } };
  orderService.list.mockResolvedValue(data);
  const response = { json: jest.fn() };
  const user = { role: "STAFF_HEAD_OFFICE" };

  await controller.listOrders({ query: { sort: "oldest", status: "received" }, user }, response, jest.fn());

  expect(orderService.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }), user, "oldest", "received");
  expect(response.json).toHaveBeenCalledWith({ success: true, ...data });
});
