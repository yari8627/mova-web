import type { Prisma } from "@prisma/client";
import { Buffer } from "buffer";
import { prisma } from "./prisma";

async function ensureDatabaseStorage(db: Prisma.TransactionClient = prisma) {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "MovaStoredFile" (
    "key" TEXT PRIMARY KEY,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function putDatabaseObject(key: string, bytes: Uint8Array, contentType: string) {
  await ensureDatabaseStorage();
  await prisma.$executeRaw`INSERT INTO "MovaStoredFile" ("key", "data", "contentType")
    VALUES (${key}, ${Buffer.from(bytes)}, ${contentType})
    ON CONFLICT ("key") DO UPDATE SET "data" = EXCLUDED."data", "contentType" = EXCLUDED."contentType"`;
}

async function getDatabaseObject(key: string) {
  await ensureDatabaseStorage();
  const rows = await prisma.$queryRaw<Array<{ data: Uint8Array }>>`SELECT "data" FROM "MovaStoredFile" WHERE "key" = ${key} LIMIT 1`;
  if (!rows[0]) throw new Error("File non disponibile");
  return Buffer.from(rows[0].data);
}

async function removeDatabaseObject(key: string, db: Prisma.TransactionClient = prisma) {
  await ensureDatabaseStorage(db);
  await db.$executeRaw`DELETE FROM "MovaStoredFile" WHERE "key" = ${key}`;
}

function configuration() {
  const clean = (value?: string) => value?.trim().replace(/^['"]|['"]$/g, "");
  const url = clean(process.env.SUPABASE_URL)?.replace(/\/$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const bucket = clean(process.env.SUPABASE_STORAGE_BUCKET) || "mova-private";
  return url && key ? { url, key, bucket } : null;
}

function objectUrl(config: NonNullable<ReturnType<typeof configuration>>, key: string) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encoded}`;
}

export function remoteStorageConfigured() { return Boolean(configuration()); }

function authenticationHeaders(config: NonNullable<ReturnType<typeof configuration>>): Record<string, string> {
  const headers: Record<string, string> = { apikey: config.key };
  // Storage requires the same bearer fallback used by the Supabase client.
  headers.Authorization = `Bearer ${config.key}`;
  return headers;
}

async function ensureBucket(config: NonNullable<ReturnType<typeof configuration>>) {
  const headers = authenticationHeaders(config);
  const existing = await fetch(`${config.url}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`, { headers, cache: "no-store" });
  if (existing.ok) return;
  if (existing.status !== 404 && existing.status !== 400) throw new Error(`Verifica storage fallita (${existing.status})`);
  const created = await fetch(`${config.url}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ id: config.bucket, name: config.bucket, public: false, file_size_limit: 10485760 }),
  });
  if (!created.ok && created.status !== 409) {
    const detail = await created.text();
    throw new Error(`Creazione archivio fallita (${created.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string) {
  const config = configuration();
  if (config) {
    try {
      await ensureBucket(config);
      const response = await fetch(objectUrl(config, key), { method: "POST", headers: { ...authenticationHeaders(config), "Content-Type": contentType, "x-upsert": "true" }, body: Buffer.from(bytes) });
      if (!response.ok) throw new Error(`Caricamento storage fallito (${response.status})`);
      return;
    } catch (error) {
      console.warn("Remote document storage unavailable, using database storage", error);
    }
  }
  await putDatabaseObject(key, bytes, contentType);
}

export async function getObject(key: string) {
  const config = configuration();
  if (config) {
    try {
      const response = await fetch(objectUrl(config, key), { headers: authenticationHeaders(config), cache: "no-store" });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch { /* Usa il database di fallback. */ }
  }
  return getDatabaseObject(key);
}

export async function removeObject(key: string, strict = false, db: Prisma.TransactionClient = prisma) {
  const config = configuration();
  if (config) {
    try {
      const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}`, { signal: AbortSignal.timeout(8000), method: "DELETE", headers: { ...authenticationHeaders(config), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [key] }) });
      if (strict && !response.ok && response.status !== 404) {
        const error = await response.json().catch(() => ({})) as { statusCode?: string | number; message?: string; error?: string };
        // Supabase can return HTTP 400 with an embedded 404 for a missing bucket.
        const missing = Number(error.statusCode) === 404 || /^(bucket|object|the resource) (not found|does not exist)\.?$/i.test(error.message || "");
        if (!missing) throw Object.assign(new Error("Eliminazione archivio non riuscita"), { code: `STORAGE_${response.status}_${Number(error.statusCode) || 0}_${/jwt|token|signature|api.key|unauthor/i.test(error.message || "") ? "AUTH" : /bucket/i.test(error.message || "") ? "BUCKET" : /permission|denied|policy/i.test(error.message || "") ? "PERMISSION" : "OTHER"}` });
      }
    } catch (error) { if (strict) throw error; }
  }
  await removeDatabaseObject(key, db);
}
