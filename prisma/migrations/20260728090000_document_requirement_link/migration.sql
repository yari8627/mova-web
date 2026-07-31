ALTER TABLE "Document" ADD COLUMN "requirementKey" TEXT;
CREATE INDEX "Document_tripId_requirementKey_idx" ON "Document"("tripId", "requirementKey");
