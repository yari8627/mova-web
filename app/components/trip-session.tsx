"use client";

import { createContext, useContext, type ReactNode } from "react";
import { setTripCacheAccount } from "../../lib/trip-client-cache";

const TripSession = createContext("");

export function TripSessionProvider({ userId, children }: { userId: string; children: ReactNode }) {
  setTripCacheAccount(userId);
  return <TripSession.Provider value={userId}>{children}</TripSession.Provider>;
}

export function useTripUserId() { return useContext(TripSession); }
