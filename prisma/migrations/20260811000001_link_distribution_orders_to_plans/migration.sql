ALTER TABLE "distribution_orders"
ADD COLUMN "distributionPlanId" INTEGER;

ALTER TABLE "distribution_orders"
ADD CONSTRAINT "distribution_orders_distributionPlanId_fkey"
FOREIGN KEY ("distributionPlanId") REFERENCES "distribution_plans"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "distribution_orders_distributionPlanId_branchId_key"
ON "distribution_orders"("distributionPlanId", "branchId");

CREATE INDEX "distribution_orders_distributionPlanId_idx"
ON "distribution_orders"("distributionPlanId");
