ALTER TABLE "Document" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "Document" ADD COLUMN "mimeType" TEXT;
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
