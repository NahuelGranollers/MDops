import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MD Ops",
  description: "Gestion de bolos, horarios e indisponibilidad"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
