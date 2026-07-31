CREATE TABLE "VisitedCountry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "visitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitedCountry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VisitedCountry_userId_countryCode_key" ON "VisitedCountry"("userId", "countryCode");
CREATE INDEX "VisitedCountry_userId_visitedAt_idx" ON "VisitedCountry"("userId", "visitedAt");
