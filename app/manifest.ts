import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "NAMI Travel", short_name: "NAMI Travel", description: "Organizza, condividi e vivi ogni viaggio insieme.", start_url: "/", scope: "/", display: "standalone", background_color: "#faf6ee", theme_color: "#145cff", orientation: "portrait-primary", categories: ["travel", "productivity", "lifestyle"], icons: [{ src: "/icons/nami-app-icon-light-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/nami-app-icon-light-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/nami-app-icon-light-master-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" }] };
}
