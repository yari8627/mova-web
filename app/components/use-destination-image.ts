"use client";

import { useEffect, useState } from "react";
import { curatedDestinationImages, fetchDestinationImage } from "../../lib/destination-images";

const imageCache = new Map<string, string>();
const imageRequests = new Map<string, Promise<string>>();

export function useDestinationImage(country?: string, city?: string) {
  const curated = country ? curatedDestinationImages[country] || "" : "";
  const key = `${country || ""}|${city || ""}`;
  const [image, setImage] = useState(() => curated || imageCache.get(key) || "");
  useEffect(() => {
    let active = true;
    const cached = curated || imageCache.get(key) || "";
    setImage(cached);
    if (!cached && country) {
      const request = imageRequests.get(key) || fetchDestinationImage(country, city).finally(() => imageRequests.delete(key));
      imageRequests.set(key, request);
      void request.then((result) => { if (result) imageCache.set(key, result); if (active) setImage(result); });
    }
    return () => { active = false; };
  }, [country, city, curated, key]);
  return image;
}
