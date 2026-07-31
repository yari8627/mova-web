ALTER TABLE "Activity" ADD COLUMN "bookingId" TEXT;
ALTER TABLE "Document" ADD COLUMN "bookingId" TEXT;
CREATE UNIQUE INDEX "Activity_bookingId_key" ON "Activity"("bookingId");
CREATE INDEX "Document_bookingId_idx" ON "Document"("bookingId");
