import type { Metadata } from "next";
import "./globals.css";
import { ModalScrollLock } from "./components/modal-scroll-lock";

export const metadata: Metadata = {
  title: "Mova — Travel together",
  description: "Organizza e vivi i tuoi viaggi insieme.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body><ModalScrollLock />{children}</body>
    </html>
  );
}
