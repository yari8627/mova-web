import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "MOVA — Travel together", short_name: "MOVA", description: "Organizza, condividi e vivi ogni viaggio insieme.", start_url: "/", scope: "/", display: "standalone", background_color: "#f7f9ff", theme_color: "#145cff", orientation: "portrait-primary", categories: ["travel", "productivity", "lifestyle"], icons: [{ src: "/icons/mova-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/mova-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/mova-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
