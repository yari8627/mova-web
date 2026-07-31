"use client";

import { useEffect, useState } from "react";
import { curatedDestinationImages, fetchDestinationImage } from "../../lib/destination-images";

export function useDestinationImage(country?: string, city?: string) {
  const curated = country ? curatedDestinationImages[country] || "" : "";
  const [image, setImage] = useState(curated);
  useEffect(() => { let active = true; setImage(curated); if (!curated && country) void fetchDestinationImage(country, city).then((result) => { if (active) setImage(result); }); return () => { active = false; }; }, [country, city, curated]);
  return image;
}
