ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarStorageKey" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarMimeType" TEXT;
CREATE UNIQUE INDEX "User_pendingEmail_key" ON "User"("pendingEmail");
CREATE UNIQUE INDEX "User_avatarStorageKey_key" ON "User"("avatarStorageKey");
