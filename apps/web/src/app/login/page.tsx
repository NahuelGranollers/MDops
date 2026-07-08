"use client";

import { useCallback, useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { ApiError, api, setSession } from "@/lib/api";
import { BrowserAPI } from "@/lib/browser-api";
import { useTranslation } from "@/lib/i18n/context";

export default function LoginPage() {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoginLoading, setAutoLoginLoading] = useState(true);
  const [autoLoginActive, setAutoLoginActive] = useState(false);

  useEffect(() => {
    let active = true;

    async function runAutoLogin() {
      try {
        const lastUser = BrowserAPI.getLocalStorage("md-ops-last-user");
        if (!lastUser) {
          if (active) setAutoLoginLoading(false);
          return;
        }
        const status = await api<{ enabled: boolean }>("/auth/autologin");
        if (!active || !status.enabled) {
          if (active) setAutoLoginLoading(false);
          return;
        }
        setAutoLoginActive(true);
        const result = await api<{ accessToken: string; refreshToken: string; user?: { roles: string[] } }>("/auth/autologin", {
          method: "POST",
          body: JSON.stringify({ identifier: lastUser })
        });
        if (!active) return;
        setSession(result.accessToken, result.refreshToken);
        const isPissarra = result.user?.roles?.includes("pissarra");
        const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
        const target = isPissarra ? `${base}/planning` : `${base}/events`;
        BrowserAPI.navigate(target);
      } catch {
        if (active) setError("");
      } finally {
        if (active) {
          setAutoLoginActive(false);
          setAutoLoginLoading(false);
        }
      }
    }

    runAutoLogin();
    return () => {
      active = false;
    };
  }, []);

  const redirectAfterLogin = useCallback((result: { accessToken: string; refreshToken: string; user?: { roles: string[] } }) => {
    setSession(result.accessToken, result.refreshToken);
    const isPissarra = result.user?.roles?.includes("pissarra");
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const target = isPissarra ? `${base}/planning` : `${base}/events`;
    BrowserAPI.navigate(target);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ accessToken: string; refreshToken: string; user?: { roles: string[] } }>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
      BrowserAPI.setLocalStorage("md-ops-last-user", identifier);
      redirectAfterLogin(result);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 404) setError(t("login.error404"));
        else if (error.status >= 500) setError(t("login.error500"));
        else setError(error.message || t("login.errorAuth"));
      } else {
        setError(t("login.errorNetwork"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
        <form className="card grid" onSubmit={submit}>
        <div>
          <h1>{t("login.title")}</h1>
          <p className="muted">{t("login.subtitle")}</p>
        </div>
        <label className="field">{t("login.username")}<input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" disabled={autoLoginActive} /></label>
        <label className="field">{t("login.password")}<input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" disabled={autoLoginActive} /></label>
        {error && <div className="badge rejected">{error}</div>}
        <button className="button" disabled={loading || autoLoginLoading || autoLoginActive}><LogIn size={18} />{autoLoginActive ? t("login.autoEntering") : loading ? t("login.entering") : t("login.enter")}</button>
      </form>
    </main>
  );
}
