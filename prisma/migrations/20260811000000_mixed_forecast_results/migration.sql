ALTER TYPE "ForecastMethod" ADD VALUE 'MIXED';

ALTER TABLE "forecast_results"
ADD COLUMN "forecastMethod" "ForecastMethod" NOT NULL DEFAULT 'ML',
ADD COLUMN "modelVersion" VARCHAR(50) NOT NULL DEFAULT 'unknown';

ALTER TABLE "forecast_results"
ALTER COLUMN "forecastMethod" DROP DEFAULT,
ALTER COLUMN "modelVersion" DROP DEFAULT;
