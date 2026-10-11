-- Additive, repeatable migration. Preserve the previous visible order once.
BEGIN;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;
WITH positions AS (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "tripId" ORDER BY "day", "time", "id") - 1)::INTEGER AS position
  FROM "Activity"
)
UPDATE "Activity" AS activity SET "sortOrder" = positions.position
FROM positions WHERE activity."id" = positions."id" AND activity."sortOrder" IS NULL;
ALTER TABLE "Activity" ALTER COLUMN "sortOrder" SET DEFAULT 0;
ALTER TABLE "Activity" ALTER COLUMN "sortOrder" SET NOT NULL;
COMMIT;
