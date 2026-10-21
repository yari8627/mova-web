import { PROGRESS_SCOPE_HEADER, PROGRESS_OWNER_HEADER, PROGRESS_EXPIRY_HEADER, type ProgressVisit } from "./progress-cache-contract";

type Entry = { scope: string; owner: string; expiresAt: number; visits: ProgressVisit[] };
type Issue = "load" | "stale" | "session" | "mutation" | null;
type Environment = {
  fetch: typeof fetch;
  readScope: () => string;
  seedScope: (scope: string, expiresAt: number) => void;
  now?: () => number;
  timeoutMs?: number;
  changed?: () => void;
};

function visitValue(value: ProgressVisit): ProgressVisit {
  if (!value || typeof value.id !== "string" || typeof value.countryCode !== "string" || typeof value.visitedAt !== "string" || typeof value.source !== "string") throw new Error("Invalid progress visit");
  return { id: value.id, countryCode: value.countryCode, visitedAt: value.visitedAt, source: value.source };
}

// The browser adapter creates this store only in a browser, never during SSR.
export function createProgressMemoryStore(environment: Environment) {
  const now = environment.now || Date.now;
  let entry: Entry | null = null;
  let issue: Issue = null;
  let generation = 0;
  let revision = 0;
  let pending: Promise<ProgressVisit[] | null> | null = null;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let tail: Promise<void> = Promise.resolve();
  let mutations = 0;
  let observedScope = environment.readScope();
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) { try { listener(); } catch { /* A subscriber cannot invalidate confirmed data. */ } } };
  const valid = () => entry && entry.scope === environment.readScope() && entry.expiresAt > now() ? entry : null;

  function cancelRead() {
    revision++;
    controller?.abort(); controller = null;
    clearTimeout(timer); timer = undefined; pending = null;
  }
  function clear() {
    generation++; cancelRead(); clearTimeout(expiryTimer); expiryTimer = undefined;
    entry = null; issue = null; observedScope = environment.readScope(); emit();
  }
  function checkSession() {
    if (observedScope !== environment.readScope() || entry && !valid()) { clear(); return true; }
    return false;
  }
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    if (entry) expiryTimer = setTimeout(() => { checkSession(); if (entry) scheduleExpiry(); }, Math.min(2147483647, Math.max(0, entry.expiresAt - now())));
  }
  function sessionFailure() { clear(); issue = "session"; emit(); }

  function revalidate(): Promise<ProgressVisit[] | null> {
    checkSession();
    if (mutations) return tail.then(revalidate);
    if (pending) return pending;
    const requestedGeneration = generation, requestedRevision = ++revision, requestedScope = environment.readScope();
    const abort = new AbortController(); controller = abort;
    timer = setTimeout(() => abort.abort(), environment.timeoutMs || 8000);
    const current = () => generation === requestedGeneration && revision === requestedRevision;
    pending = environment.fetch("/api/progress", { cache: "no-store", signal: abort.signal }).then(async response => {
      if (!current()) return null;
      if (environment.readScope() !== requestedScope) { sessionFailure(); return null; }
      if (response.status === 401 || response.status === 403) { sessionFailure(); return null; }
      if (!response.ok) throw new Error("Progress request failed");
      const payload = await response.json() as ProgressVisit[];
      if (!current()) return null;
      if (environment.readScope() !== requestedScope) { sessionFailure(); return null; }
      const scope = response.headers.get(PROGRESS_SCOPE_HEADER) || "";
      const owner = response.headers.get(PROGRESS_OWNER_HEADER) || "";
      const expiresAt = Date.parse(response.headers.get(PROGRESS_EXPIRY_HEADER) || "");
      if (!Array.isArray(payload) || !/^[\da-f-]{36}$/i.test(scope) || !/^[\da-f]{64}$/i.test(owner) || !(expiresAt > now())) throw new Error("Unverified progress identity");
      const visits = payload.map(visitValue);
      if (requestedScope && requestedScope !== scope) { sessionFailure(); return null; }
      if (!requestedScope) environment.seedScope(scope, expiresAt);
      if (environment.readScope() !== scope) { sessionFailure(); return null; }
      observedScope = scope;
      const previous = valid();
      entry = { scope, owner, expiresAt, visits: previous?.owner === owner && JSON.stringify(previous.visits) === JSON.stringify(visits) ? previous.visits : visits };
      issue = null; scheduleExpiry(); emit();
      return entry.visits;
    }).catch(() => {
      if (current()) {
        if (environment.readScope() !== requestedScope) sessionFailure();
        else { issue = valid() ? "stale" : "load"; emit(); }
      }
      return valid()?.visits || null;
    }).finally(() => {
      if (current()) { clearTimeout(timer); timer = undefined; pending = null; controller = null; }
    });
    return pending;
  }

  async function mutate(code: string, source: "manual" | "position" | null) {
    checkSession();
    const intentGeneration = generation;
    if (!valid()) await revalidate();
    const identity = valid();
    if (!identity || generation !== intentGeneration) throw new Error("Session unavailable");
    const scope = identity.scope, requestedGeneration = generation;
    mutations++; cancelRead();
    const current = () => generation === requestedGeneration && environment.readScope() === scope && valid()?.owner === identity.owner;
    const operation = tail.then(async () => {
      if (!current()) throw new Error("Session changed");
      const response = await environment.fetch(source === null ? `/api/progress?countryCode=${encodeURIComponent(code)}` : "/api/progress", {
        method: source === null ? "DELETE" : "POST",
        ...(source === null ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countryCode: code, source }) }),
      });
      if (!current()) throw new Error("Session changed");
      if (response.status === 401 || response.status === 403) { sessionFailure(); throw new Error("Session expired"); }
      if (!response.ok) throw new Error("Mutation failed");
      const saved = source === null ? null : visitValue(await response.json() as ProgressVisit);
      if (!current()) throw new Error("Session changed");
      cancelRead();
      const visits = valid()!.visits;
      entry = { ...identity, visits: saved ? [saved, ...visits.filter(item => item.countryCode !== code)] : visits.filter(item => item.countryCode !== code) };
      issue = null; scheduleExpiry(); emit();
      try { environment.changed?.(); } catch { /* Cross-tab notifications are optional. */ }
    }).catch(error => {
      if (current()) { issue = "mutation"; emit(); }
      else if (generation === requestedGeneration) sessionFailure();
      throw error;
    }).finally(() => { mutations--; });
    tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  return {
    read: () => valid()?.visits || null,
    issue: () => issue,
    clear, checkSession, revalidate,
    invalidateData() { cancelRead(); },
    add: (code: string, source: "manual" | "position" = "manual") => mutate(code, source),
    remove: (code: string) => mutate(code, null),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hasSubscribers: () => listeners.size > 0,
  };
}
