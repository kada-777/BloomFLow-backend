# Distribution Order Retrieval Design

**Goal:** Add `GET /distributions/:id` so authenticated users can view a shipment's branch, status, shipped time, and flower/batch allocations.

**Access:** `SUPERADMIN` and `STAFF_HEAD_OFFICE` can view any order. `STAFF_BRANCH` can view only orders whose `branchId` matches their JWT user record. Orders outside the branch scope are reported as not found.

**Data flow:** The route calls a controller, which passes the route ID and authenticated user to a distribution-order service. The service validates the ID, queries Prisma using the existing distribution order relations, applies branch scope, and returns a shaped detail object.

**Testing:** Unit tests cover the returned order detail, branch scope rejection, invalid IDs, and controller response delegation.
