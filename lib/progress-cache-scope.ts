import { createHash, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { PROGRESS_SCOPE_COOKIE } from "./progress-cache-contract";

const options = { httpOnly: false, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

// A public cache invalidator, never an authentication credential or user identifier.
// Only the HttpOnly mova_session cookie and the existing DB checks authorize requests.
export async function rotateProgressScope(expiresAt?: Date | string) {
  (await cookies()).set(PROGRESS_SCOPE_COOKIE, randomUUID(), { ...options, ...(expiresAt ? { expires: new Date(expiresAt) } : {}) });
}

export async function endProgressScope() {
  // A tombstone blocks late pre-logout responses from bootstrapping an empty scope.
  (await cookies()).set(PROGRESS_SCOPE_COOKIE, "signed-out", options);
}

export async function progressCacheScope(userId: string, expiresAt: string) {
  const stored = (await cookies()).get(PROGRESS_SCOPE_COOKIE)?.value;
  const scope = stored && /^[\da-f-]{36}$/i.test(stored) ? stored : randomUUID();
  // GET never sets a cookie: an old response must not overwrite a newer login.
  // Legacy sessions initialize this public marker client-side only if still absent.
  return { scope, owner: createHash("sha256").update(`${userId}:${scope}`).digest("hex"), expiresAt };
}
