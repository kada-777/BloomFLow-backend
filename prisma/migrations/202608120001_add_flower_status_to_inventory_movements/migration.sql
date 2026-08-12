CREATE TYPE "FlowerStatus" AS ENUM ('FRESH', 'GRADE_C', 'DAMAGED');

ALTER TABLE "inventory_movements"
ADD COLUMN "flowerStatus" "FlowerStatus" NOT NULL DEFAULT 'FRESH';
