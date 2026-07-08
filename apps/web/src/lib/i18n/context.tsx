"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { translations, type Locale } from "./translations";
import { BrowserAPI } from "../browser-api";

type I18nContext = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18nContext | null>(null);

function resolve(obj: any, key: string): string | undefined {
  const parts = key.split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ca");

  useEffect(() => {
    const saved = BrowserAPI.getLocalStorage("md-ops-locale") as Locale | null;
    if (saved === "es" || saved === "ca") setLocaleState(saved);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    BrowserAPI.setLocalStorage("md-ops-locale", next);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const value = resolve(translations[locale], key) ?? resolve(translations.es, key) ?? key;
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
  }, [locale]);

  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export function useTranslation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
