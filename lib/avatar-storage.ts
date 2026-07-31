import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { getObject, putObject, remoteStorageConfigured, removeObject } from "./object-storage";

export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
export const AVATAR_MIME_TYPES = new Map([["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"]]);
const directory = path.join(process.cwd(), "storage", "avatars");

function safeKey(key: string) { if (!key || path.basename(key) !== key || key.includes("..")) throw new Error("Chiave avatar non valida"); return key; }
export async function saveAvatar(key: string, bytes: Uint8Array, contentType = "application/octet-stream") { const safe = safeKey(key); if (remoteStorageConfigured()) return putObject(`avatars/${safe}`, bytes, contentType); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, safe), bytes); }
export async function readAvatar(key: string) { const safe = safeKey(key); if (remoteStorageConfigured()) return getObject(`avatars/${safe}`); return readFile(path.join(directory, safe)); }
export async function deleteAvatar(key?: string | null) { if (!key) return; const safe = safeKey(key); if (remoteStorageConfigured()) return removeObject(`avatars/${safe}`); try { await unlink(path.join(directory, safe)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
