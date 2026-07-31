import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { getObject, putObject, remoteStorageConfigured, removeObject } from "./object-storage";

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = new Map([["application/pdf", ".pdf"], ["image/png", ".png"], ["image/jpeg", ".jpg"]]);
const storageDirectory = path.join(process.cwd(), "storage", "documents");

function safeKey(key: string) { if (!key || path.basename(key) !== key || key.includes("..")) throw new Error("Chiave file non valida"); return key; }
export async function saveDocumentFile(key: string, bytes: Uint8Array, contentType = "application/octet-stream") { const safe = safeKey(key); if (remoteStorageConfigured()) return putObject(`documents/${safe}`, bytes, contentType); await mkdir(storageDirectory, { recursive: true }); await writeFile(path.join(storageDirectory, safe), bytes); }
export async function readDocumentFile(key: string) { const safe = safeKey(key); if (remoteStorageConfigured()) return getObject(`documents/${safe}`); return readFile(path.join(storageDirectory, safe)); }
export async function deleteDocumentFile(key?: string | null) { if (!key) return; const safe = safeKey(key); if (remoteStorageConfigured()) return removeObject(`documents/${safe}`); try { await unlink(path.join(storageDirectory, safe)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
