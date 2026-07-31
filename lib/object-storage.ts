import { Buffer } from "buffer";

function configuration() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "mova-private";
  return url && key ? { url, key, bucket } : null;
}

function objectUrl(config: NonNullable<ReturnType<typeof configuration>>, key: string) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encoded}`;
}

export function remoteStorageConfigured() { return Boolean(configuration()); }

export async function putObject(key: string, bytes: Uint8Array, contentType: string) {
  const config = configuration();
  if (!config) throw new Error("Storage remoto non configurato");
  const response = await fetch(objectUrl(config, key), { method: "POST", headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": contentType, "x-upsert": "true" }, body: Buffer.from(bytes) });
  if (!response.ok) throw new Error(`Caricamento storage fallito (${response.status})`);
}

export async function getObject(key: string) {
  const config = configuration();
  if (!config) throw new Error("Storage remoto non configurato");
  const response = await fetch(objectUrl(config, key), { headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`File non disponibile (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

export async function removeObject(key: string) {
  const config = configuration();
  if (!config) throw new Error("Storage remoto non configurato");
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}`, { method: "DELETE", headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [key] }) });
  if (!response.ok && response.status !== 404) throw new Error(`Eliminazione storage fallita (${response.status})`);
}
