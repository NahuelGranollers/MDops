"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Shield } from "lucide-react";
import { ApiError, api, setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoginLoading, setAutoLoginLoading] = useState(true);
  const [autoLoginActive, setAutoLoginActive] = useState(false);

  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);

  useEffect(() => {
    let active = true;

    async function runAutoLogin() {
      try {
        const rememberToken = window.localStorage.getItem("md-ops-remember-token");
        if (!rememberToken) {
          if (active) setAutoLoginLoading(false);
          return;
        }
        setAutoLoginActive(true);
        const result = await api<{ accessToken: string; refreshToken: string }>("/auth/auto-login-remember", {
          method: "POST",
          body: JSON.stringify({ rememberToken })
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
      const result = await api<{ accessToken: string; refreshToken: string; requires2FA?: boolean; tempToken?: string }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ identifier, password }) }
      );
      if (result.requires2FA && result.tempToken) {
        setTempToken(result.tempToken);
        setRequires2FA(true);
        setLoading(false);
        return;
      }
      setSession(result.accessToken, result.refreshToken);
      const rememberResult = await api<{ rememberToken: string }>("/auth/remember", { method: "POST" });
      window.localStorage.setItem("md-ops-remember-token", rememberResult.rememberToken);
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 404) setError("La API no esta respondiendo en la ruta de login.");
        else if (error.status >= 500) setError("La API ha fallado. Revisa variables de Vercel y base de datos.");
        else setError(error.message || "No se ha podido entrar. Revisa usuario y password.");
      } else {
        setError("No se puede conectar con la API. Revisa el despliegue de Vercel.");
      }
    } finally {
      if (!requires2FA) setLoading(false);
    }
  }

  async function submit2FA(event: React.FormEvent) {
    event.preventDefault();
    if (twoFACode.length !== 6) {
      setError("El código debe tener 6 dígitos.");
      return;
    }
    setVerifying2FA(true);
    setError("");
    try {
      const result = await api<{ accessToken: string; refreshToken: string }>("/auth/2fa/complete", {
        method: "POST",
        body: JSON.stringify({ tempToken, token: twoFACode })
      });
      setSession(result.accessToken, result.refreshToken);
      const rememberResult = await api<{ rememberToken: string }>("/auth/remember", { method: "POST" });
      window.localStorage.setItem("md-ops-remember-token", rememberResult.rememberToken);
      router.replace("/dashboard");
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message || "Código incorrecto.");
      } else {
        setError("No se puede conectar con la API.");
      }
    } finally {
      setVerifying2FA(false);
    }
  }

  if (requires2FA) {
    return (
      <main className="login">
        <form className="card grid" onSubmit={submit2FA}>
          <div>
            <h1>MD Ops</h1>
            <p className="muted">Introduce el código de verificación de tu app de autenticación.</p>
          </div>
          <label className="field">Código 2FA
            <input className="input" value={twoFACode} onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoComplete="one-time-code" inputMode="numeric" autoFocus required />
          </label>
          {error && <div className="badge rejected">{error}</div>}
          <button className="button" disabled={verifying2FA || twoFACode.length !== 6}>
            <Shield size={18} />{verifying2FA ? "Verificando..." : "Verificar"}
          </button>
        </form>
      </main>
    );
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
