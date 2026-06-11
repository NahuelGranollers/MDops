import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/context";

export const metadata: Metadata = {
  title: "PISARRA MD",
  description: "Gestió de bolos, horaris i indisponibilitat"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
