jest.mock("../src/services/distribution-receiving.service", () => ({
  receive: jest.fn(),
}));

const receivingService = require("../src/services/distribution-receiving.service");
const controller = require("../src/controllers/distribution-receiving.controller");

test("returns the received order", async () => {
  const data = { id: 11, status: "RECEIVED" };
  const user = { role: "STAFF_BRANCH", branchId: 7 };
  receivingService.receive.mockResolvedValue(data);
  const response = { json: jest.fn() };

  await controller.receiveOrder({ params: { id: "11" }, body: { items: [] }, user }, response, jest.fn());

  expect(receivingService.receive).toHaveBeenCalledWith("11", { items: [] }, user);
  expect(response.json).toHaveBeenCalledWith({ success: true, data });
});
