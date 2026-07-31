ALTER TABLE "Document" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Expense" ADD COLUMN "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;
CREATE INDEX "Document_createdById_idx" ON "Document"("createdById");
CREATE INDEX "Expense_createdById_idx" ON "Expense"("createdById");
