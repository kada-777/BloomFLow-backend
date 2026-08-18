/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPERADMIN', 'STAFF_HEAD_OFFICE', 'STAFF_BRANCH');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('AVAILABLE', 'DEPLETED');

-- CreateEnum
CREATE TYPE "ForecastMethod" AS ENUM ('ML', 'BASELINE');

-- CreateEnum
CREATE TYPE "DistributionPlanStatus" AS ENUM ('DRAFT', 'FINALIZED', 'ORDER_CREATED');

-- CreateEnum
CREATE TYPE "DistributionOrderStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('HO', 'BRANCH');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIVING_IN', 'DISTRIBUTION_OUT', 'DISTRIBUTION_IN', 'SALE_OUT', 'DAMAGED_OUT');

-- CreateEnum
CREATE TYPE "InventoryReferenceType" AS ENUM ('RECEIVING', 'DISTRIBUTION_ORDER', 'DAILY_SALE');

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "branchId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "location" TEXT NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flowers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "variety" VARCHAR(100) NOT NULL,

    CONSTRAINT "flowers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configurations" (
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configurations_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "token_blacklist" (
    "jti" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_blacklist_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "receivings" (
    "id" SERIAL NOT NULL,
    "farmId" INTEGER NOT NULL,
    "receivedDate" DATE NOT NULL,
    "status" VARCHAR(50) NOT NULL,

    CONSTRAINT "receivings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiving_items" (
    "id" SERIAL NOT NULL,
    "receivingId" INTEGER NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "shippedQuantity" DECIMAL(10,2) NOT NULL,
    "actualReceivedQuantity" DECIMAL(10,2) NOT NULL,
    "acceptedQuantity" DECIMAL(10,2) NOT NULL,
    "unusableQuantity" DECIMAL(10,2) NOT NULL,
    "unusableNotes" TEXT,

    CONSTRAINT "receiving_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flower_batches" (
    "id" SERIAL NOT NULL,
    "batchNumber" VARCHAR(100) NOT NULL,
    "receivingId" INTEGER NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "receivedDate" DATE NOT NULL,
    "initialQuantity" DECIMAL(10,2) NOT NULL,
    "availableQuantity" DECIMAL(10,2) NOT NULL,
    "status" "BatchStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flower_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_runs" (
    "id" SERIAL NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelVersion" VARCHAR(50) NOT NULL,
    "forecastMethod" "ForecastMethod" NOT NULL,
    "trainingDataUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecast_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_results" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "forecastDemand" DECIMAL(10,2) NOT NULL,
    "forecastPeriod" VARCHAR(50) NOT NULL,
    "confidenceInterval" DECIMAL(5,2),

    CONSTRAINT "forecast_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_plans" (
    "id" SERIAL NOT NULL,
    "status" "DistributionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "planningDate" DATE NOT NULL,

    CONSTRAINT "distribution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_plan_items" (
    "id" SERIAL NOT NULL,
    "distributionPlanId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "recommendedQuantity" DECIMAL(10,2) NOT NULL,
    "finalQuantity" DECIMAL(10,2),
    "adjustmentReason" VARCHAR(255),

    CONSTRAINT "distribution_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_orders" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "status" "DistributionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "shippedAt" TIMESTAMP(3),

    CONSTRAINT "distribution_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_batch_allocations" (
    "id" SERIAL NOT NULL,
    "distributionOrderId" INTEGER NOT NULL,
    "batchId" INTEGER NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "distribution_batch_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_receipts" (
    "id" SERIAL NOT NULL,
    "distributionOrderId" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_receipt_items" (
    "id" SERIAL NOT NULL,
    "distributionReceiptId" INTEGER NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "receivedQuantity" DECIMAL(10,2) NOT NULL,
    "damagedQuantity" DECIMAL(10,2) NOT NULL,
    "missingQuantity" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "distribution_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_stock_lots" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "shippedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sales" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "salesDate" DATE NOT NULL,

    CONSTRAINT "daily_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sales_items" (
    "id" SERIAL NOT NULL,
    "dailySaleId" INTEGER NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "soldQuantity" DECIMAL(10,2) NOT NULL,
    "damagedQuantity" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "daily_sales_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" BIGSERIAL NOT NULL,
    "flowerId" INTEGER NOT NULL,
    "locationType" "LocationType" NOT NULL,
    "branchId" INTEGER,
    "batchId" INTEGER,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "qtyBefore" DECIMAL(10,2) NOT NULL,
    "qtyAfter" DECIMAL(10,2) NOT NULL,
    "referenceType" "InventoryReferenceType" NOT NULL,
    "referenceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_branchId_idx" ON "users"("branchId");

-- CreateIndex
CREATE INDEX "system_configurations_updatedBy_idx" ON "system_configurations"("updatedBy");

-- CreateIndex
CREATE INDEX "token_blacklist_expiresAt_idx" ON "token_blacklist"("expiresAt");

-- CreateIndex
CREATE INDEX "receivings_farmId_receivedDate_idx" ON "receivings"("farmId", "receivedDate");

-- CreateIndex
CREATE INDEX "receiving_items_flowerId_idx" ON "receiving_items"("flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "receiving_items_receivingId_flowerId_key" ON "receiving_items"("receivingId", "flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "flower_batches_batchNumber_key" ON "flower_batches"("batchNumber");

-- CreateIndex
CREATE INDEX "flower_batches_receivingId_idx" ON "flower_batches"("receivingId");

-- CreateIndex
CREATE INDEX "flower_batches_flowerId_receivedDate_createdAt_idx" ON "flower_batches"("flowerId", "receivedDate", "createdAt");

-- CreateIndex
CREATE INDEX "forecast_results_branchId_flowerId_forecastPeriod_idx" ON "forecast_results"("branchId", "flowerId", "forecastPeriod");

-- CreateIndex
CREATE INDEX "forecast_results_flowerId_idx" ON "forecast_results"("flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_results_runId_branchId_flowerId_forecastPeriod_key" ON "forecast_results"("runId", "branchId", "flowerId", "forecastPeriod");

-- CreateIndex
CREATE INDEX "distribution_plans_status_planningDate_idx" ON "distribution_plans"("status", "planningDate");

-- CreateIndex
CREATE INDEX "distribution_plan_items_branchId_flowerId_idx" ON "distribution_plan_items"("branchId", "flowerId");

-- CreateIndex
CREATE INDEX "distribution_plan_items_flowerId_idx" ON "distribution_plan_items"("flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_plan_items_distributionPlanId_branchId_flowerI_key" ON "distribution_plan_items"("distributionPlanId", "branchId", "flowerId");

-- CreateIndex
CREATE INDEX "distribution_orders_branchId_status_idx" ON "distribution_orders"("branchId", "status");

-- CreateIndex
CREATE INDEX "distribution_batch_allocations_batchId_idx" ON "distribution_batch_allocations"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_batch_allocations_distributionOrderId_batchId_key" ON "distribution_batch_allocations"("distributionOrderId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_receipts_distributionOrderId_key" ON "distribution_receipts"("distributionOrderId");

-- CreateIndex
CREATE INDEX "distribution_receipt_items_flowerId_idx" ON "distribution_receipt_items"("flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_receipt_items_distributionReceiptId_flowerId_key" ON "distribution_receipt_items"("distributionReceiptId", "flowerId");

-- CreateIndex
CREATE INDEX "branch_stock_lots_branchId_flowerId_shippedAt_idx" ON "branch_stock_lots"("branchId", "flowerId", "shippedAt");

-- CreateIndex
CREATE INDEX "branch_stock_lots_sourceOrderId_idx" ON "branch_stock_lots"("sourceOrderId");

-- CreateIndex
CREATE INDEX "branch_stock_lots_flowerId_idx" ON "branch_stock_lots"("flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_sales_branchId_salesDate_key" ON "daily_sales"("branchId", "salesDate");

-- CreateIndex
CREATE INDEX "daily_sales_items_flowerId_idx" ON "daily_sales_items"("flowerId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_sales_items_dailySaleId_flowerId_key" ON "daily_sales_items"("dailySaleId", "flowerId");

-- CreateIndex
CREATE INDEX "inventory_movements_flowerId_createdAt_idx" ON "inventory_movements"("flowerId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_branchId_flowerId_createdAt_idx" ON "inventory_movements"("branchId", "flowerId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_batchId_idx" ON "inventory_movements"("batchId");

-- CreateIndex
CREATE INDEX "inventory_movements_referenceType_referenceId_idx" ON "inventory_movements"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_configurations" ADD CONSTRAINT "system_configurations_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivings" ADD CONSTRAINT "receivings_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_items" ADD CONSTRAINT "receiving_items_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "receivings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_items" ADD CONSTRAINT "receiving_items_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flower_batches" ADD CONSTRAINT "flower_batches_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "receivings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flower_batches" ADD CONSTRAINT "flower_batches_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_results" ADD CONSTRAINT "forecast_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "forecast_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_results" ADD CONSTRAINT "forecast_results_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_results" ADD CONSTRAINT "forecast_results_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_plan_items" ADD CONSTRAINT "distribution_plan_items_distributionPlanId_fkey" FOREIGN KEY ("distributionPlanId") REFERENCES "distribution_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_plan_items" ADD CONSTRAINT "distribution_plan_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_plan_items" ADD CONSTRAINT "distribution_plan_items_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_orders" ADD CONSTRAINT "distribution_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_batch_allocations" ADD CONSTRAINT "distribution_batch_allocations_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "distribution_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_batch_allocations" ADD CONSTRAINT "distribution_batch_allocations_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "flower_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_receipts" ADD CONSTRAINT "distribution_receipts_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "distribution_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_receipt_items" ADD CONSTRAINT "distribution_receipt_items_distributionReceiptId_fkey" FOREIGN KEY ("distributionReceiptId") REFERENCES "distribution_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_receipt_items" ADD CONSTRAINT "distribution_receipt_items_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stock_lots" ADD CONSTRAINT "branch_stock_lots_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stock_lots" ADD CONSTRAINT "branch_stock_lots_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stock_lots" ADD CONSTRAINT "branch_stock_lots_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "distribution_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sales" ADD CONSTRAINT "daily_sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sales_items" ADD CONSTRAINT "daily_sales_items_dailySaleId_fkey" FOREIGN KEY ("dailySaleId") REFERENCES "daily_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sales_items" ADD CONSTRAINT "daily_sales_items_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_flowerId_fkey" FOREIGN KEY ("flowerId") REFERENCES "flowers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "flower_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
