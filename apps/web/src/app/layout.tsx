import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/context";
import { SensitiveAccessProvider } from "@/lib/sensitive-access-context";
import { UpdateBanner } from "@/components/update-banner";

export const metadata: Metadata = {
  title: "PISARRA MD",
  description: "Gestió de bolos, horaris i indisponibilitat"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body>
        <UpdateBanner />
        <I18nProvider><SensitiveAccessProvider>{children}</SensitiveAccessProvider></I18nProvider>
      </body>
    </html>
  );
}
