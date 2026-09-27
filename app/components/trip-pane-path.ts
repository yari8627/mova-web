"use client";
import { createContext, useContext } from "react";
import { usePathname } from "next/navigation";
export const TripPanePath = createContext<string | null>(null);
export function useTripPaneActive() {
  const pane = useContext(TripPanePath);
  const path = usePathname();
  return !pane || pane === path;
}
