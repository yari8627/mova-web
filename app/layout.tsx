import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ModalScrollLock } from "./components/modal-scroll-lock";
import { PwaInstall } from "./components/pwa-install";
import { AppBottomNav } from "./components/app-bottom-nav";

export const metadata: Metadata = {
  title: "NAMI Travel",
  description: "Organizza e vivi i tuoi viaggi insieme.",
  applicationName: "NAMI Travel",
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NAMI Travel" },
  icons: { icon: [{ url: "/icons/nami-app-icon-light-48.png", sizes: "48x48", type: "image/png" }, { url: "/icons/nami-app-icon-light-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/nami-app-icon-light-512.png", sizes: "512x512", type: "image/png" }], apple: [{ url: "/icons/nami-app-icon-light-180.png", sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = { themeColor: "#145cff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body><ModalScrollLock /><PwaInstall />{children}<AppBottomNav /></body>
    </html>
  );
}
