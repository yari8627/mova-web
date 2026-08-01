ALTER TABLE "PackingItem" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'personal';

CREATE INDEX "PackingItem_tripId_scope_createdAt_idx" ON "PackingItem"("tripId", "scope", "createdAt");
