"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { api, setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
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
        const lastUser = window.localStorage.getItem("md-ops-last-user");
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
        const result = await api<{ accessToken: string; refreshToken: string }>("/auth/autologin", {
          method: "POST",
          body: JSON.stringify({ identifier: lastUser })
        });
        if (!active) return;
        setSession(result.accessToken, result.refreshToken);
        router.replace("/dashboard");
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
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ accessToken: string; refreshToken: string }>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
      setSession(result.accessToken, result.refreshToken);
      window.localStorage.setItem("md-ops-last-user", identifier);
      router.replace("/dashboard");
    } catch {
      setError("No se ha podido entrar. Revisa usuario y password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <form className="card grid" onSubmit={submit}>
        <div>
          <h1>MD Ops</h1>
          <p className="muted">Agenda operativa de bolos, equipo e indisponibilidad.</p>
        </div>
        <label className="field">Usuario<input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" disabled={autoLoginActive} /></label>
        <label className="field">Password<input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" disabled={autoLoginActive} /></label>
        {error && <div className="badge rejected">{error}</div>}
        <button className="button" disabled={loading || autoLoginLoading || autoLoginActive}><LogIn size={18} />{autoLoginActive ? "Entrando automáticamente..." : loading ? "Entrando..." : "Entrar"}</button>
      </form>
    </main>
  );
}
