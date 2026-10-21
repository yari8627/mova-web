"use client";

import { createProgressMemoryStore } from "./progress-memory-store";
import { PROGRESS_SCOPE_COOKIE } from "./progress-cache-contract";

let store: ReturnType<typeof createProgressMemoryStore> | undefined;
let channel: BroadcastChannel | undefined;
function broadcast(value: string) { try { channel?.postMessage(value); } catch { /* Optional cross-tab transport. */ } }

function browserStore() {
  if (typeof window === "undefined" || typeof document === "undefined") return undefined;
  if (!store) {
    const readScope = () => document.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${PROGRESS_SCOPE_COOKIE}=`))?.slice(PROGRESS_SCOPE_COOKIE.length + 1) || "";
    store = createProgressMemoryStore({ fetch: (...args) => fetch(...args), readScope,
      seedScope(scope, expiresAt) {
        // An old GET cannot overwrite a newer login/logout marker.
        if (!readScope()) document.cookie = `${PROGRESS_SCOPE_COOKIE}=${scope}; Path=/; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${location.protocol === "https:" ? "; Secure" : ""}`;
      }, changed: () => broadcast("changed"),
    });
    const wake = () => {
      store!.checkSession();
      if (store!.hasSubscribers() && document.visibilityState !== "hidden") void store!.revalidate();
    };
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", wake);
    const cookieEvents = (window as unknown as { cookieStore?: Pick<EventTarget, "addEventListener"> }).cookieStore;
    cookieEvents?.addEventListener("change", () => {
      if (store!.checkSession() && store!.hasSubscribers() && document.visibilityState !== "hidden") void store!.revalidate();
    });
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel("nami-progress-invalidation");
        channel.onmessage = event => {
          if (event.data === "invalidate") store!.clear();
          if (event.data === "changed") { store!.invalidateData(); if (store!.hasSubscribers()) void store!.revalidate(); }
          if (event.data === "scope-check") store!.checkSession();
        };
      } catch { /* The cookie guard still isolates sessions when channels are unavailable. */ }
    }
  }
  return store;
}

export function readProgressMemory() { return browserStore()?.read() || null; }
export function subscribeProgressMemory(listener: () => void) { return browserStore()?.subscribe(listener) || (() => {}); }
export function refreshProgressMemory() { return browserStore()?.revalidate() || Promise.resolve(null); }
export function resetProgressMemory() { browserStore()?.clear(); broadcast("invalidate"); }
export function checkProgressSessionAcrossTabs() { browserStore()?.checkSession(); broadcast("scope-check"); }
export function addProgressCountry(code: string, source: "manual" | "position" = "manual") { return browserStore()?.add(code, source) || Promise.reject(new Error("Browser required")); }
export function removeProgressCountry(code: string) { return browserStore()?.remove(code) || Promise.reject(new Error("Browser required")); }
export function progressMemoryMessage() {
  switch (browserStore()?.issue()) {
    case "stale": return "Aggiornamento non riuscito. Stai visualizzando gli ultimi dati disponibili.";
    case "load": return "I Paesi visitati non sono temporaneamente disponibili.";
    case "session": return "La sessione è cambiata o scaduta. Riprova per aggiornare i dati.";
    case "mutation": return "Modifica non salvata. Riprova.";
    default: return "";
  }
}
