import { prisma } from "./prisma";

let ready: Promise<void> | undefined;

/** Use the API's serverless database connection, before any Activity read/write. */
export function ensureActivityOrder(): Promise<void> {
  if (!ready) ready = migrate().catch(error => { ready = undefined; throw error; });
  return ready;
}

async function migrate() {
  const columns = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'Activity' AND column_name = 'sortOrder'
  `;
  if (columns[0]?.is_nullable === "NO") return;
  await prisma.$transaction(async tx => {
    // Serialize cold starts; every statement is repeatable and preserves existing positions.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72619401)`;
    await tx.$executeRaw`ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER`;
    await tx.$executeRaw`
      WITH positions AS (
        SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "tripId" ORDER BY "day", "time", "id") - 1)::INTEGER AS position
        FROM "Activity"
      )
      UPDATE "Activity" AS activity SET "sortOrder" = positions.position
      FROM positions WHERE activity."id" = positions."id" AND activity."sortOrder" IS NULL
    `;
    await tx.$executeRaw`ALTER TABLE "Activity" ALTER COLUMN "sortOrder" SET DEFAULT 0`;
    await tx.$executeRaw`ALTER TABLE "Activity" ALTER COLUMN "sortOrder" SET NOT NULL`;
  }, { timeout: 30000 });
}
