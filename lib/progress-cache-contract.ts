export const PROGRESS_SCOPE_COOKIE = "nami_progress_scope";
export const PROGRESS_SCOPE_HEADER = "X-Nami-Progress-Scope";
export const PROGRESS_OWNER_HEADER = "X-Nami-Progress-Owner";
export const PROGRESS_EXPIRY_HEADER = "X-Nami-Progress-Expiry";
export type ProgressVisit = { id: string; countryCode: string; visitedAt: string; source: "manual" | "position" | "trip" };
