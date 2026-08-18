# Distribution Order Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /distributions/:id` for authenticated distribution-order detail retrieval.

**Architecture:** Add a focused order service and controller, following the existing plan route pattern. Query the existing Prisma relations and enforce branch scope for `STAFF_BRANCH` users.

**Tech Stack:** CommonJS JavaScript, Express 5, Prisma, Jest.

## Global Constraints

- Branch staff may access only their own branch's orders.
- The endpoint is read-only and makes no database mutations.

---

### Task 1: Add Retrieval Tests and Endpoint

**Files:**
- Create: `test/distribution-order.service.test.js`
- Create: `test/distribution-order.controller.test.js`
- Create: `src/services/distribution-order.service.js`
- Create: `src/controllers/distribution-order.controller.js`
- Create: `src/routes/distribution-order.routes.js`
- Modify: `src/routes/index.js`

- [ ] Write service tests for successful detail retrieval, invalid IDs, and branch scope.
- [ ] Write controller test for `{ success: true, data }` response delegation.
- [ ] Implement the service, controller, route, and route registration.
- [ ] Run the focused tests, then the full Jest suite.
