ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" DATETIME;
CREATE TABLE "EmailToken" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "type" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "usedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");
CREATE INDEX "EmailToken_userId_type_usedAt_idx" ON "EmailToken"("userId", "type", "usedAt");
