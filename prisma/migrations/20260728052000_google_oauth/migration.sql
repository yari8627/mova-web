ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "User" ADD COLUMN "externalAvatarUrl" TEXT;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
