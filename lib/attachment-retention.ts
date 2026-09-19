import { prisma } from "./prisma";
import { deleteDocumentFile } from "./document-storage";

// Keep attachments for three full days after the trip's calendar end date.
export function attachmentCutoff(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
}

export async function cleanupExpiredAttachments(now = new Date()) {
  const cutoff = attachmentCutoff(now);
  const candidates = await prisma.document.findMany({
    where: { storageKey: { not: null }, trip: { endDate: { lt: cutoff } } },
    select: { id: true, tripId: true }, orderBy: { id: "asc" }, take: 100,
  });
  const started = Date.now();
  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    if (Date.now() - started > 40000) break;
    try {
      const removed = await prisma.$transaction(async tx => {
        // Serialize with date edits; recheck eligibility immediately before deletion.
        await tx.$queryRaw`SELECT "id" FROM "Trip" WHERE "id" = ${candidate.tripId} FOR UPDATE`;
        const document = await tx.document.findFirst({
          where: { id: candidate.id, storageKey: { not: null }, trip: { endDate: { lt: cutoff } } },
        });
        if (!document?.storageKey) return false;
        await deleteDocumentFile(document.storageKey, true);
        await tx.document.delete({ where: { id: document.id } });
        return true;
      }, { timeout: 15000 });
      if (removed) deleted++;
    } catch { failed++; }
  }
  return { deleted, failed };
}
