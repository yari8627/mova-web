DROP INDEX IF EXISTS "Activity_bookingId_key";
ALTER TABLE "Activity" ADD COLUMN "bookingEvent" TEXT;
CREATE INDEX "Activity_bookingId_idx" ON "Activity"("bookingId");
