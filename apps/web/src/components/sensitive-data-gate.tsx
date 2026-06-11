"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useSensitiveAccess } from "@/lib/sensitive-access-context";
import { useTranslation } from "@/lib/i18n/context";
import { useSession } from "@/lib/use-session";

export function SensitiveDataGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const { granted, verify } = useSensitiveAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [has2FA, setHas2FA] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    api<{ enabled: boolean }>("/auth/2fa/status").then((status) => {
      setHas2FA(status.enabled);
    }).catch(() => setHas2FA(false));
  }, [user]);

  useEffect(() => {
    if (showGate && inputRef.current) inputRef.current.focus();
  }, [showGate]);

  if (has2FA === null || !user || has2FA === false) return <>{children}</>;

  if (granted && visible) return <>{children}</>;

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setVerifying(true);
    setError("");
    try {
      await verify(code);
      setVisible(true);
      setShowGate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("twoFA.error"));
    } finally {
      setVerifying(false);
    }
  }

  if (!showGate) {
    const label = granted ? t("common.sensitiveView") : t("common.sensitiveHidden");
    return (
      <span className="inline-sensitive-gate">
        <EyeOff size={13} className="muted" style={{ verticalAlign: "middle", marginRight: 4 }} />
        <span className="muted" style={{ fontSize: "0.85em", fontStyle: "italic", marginRight: 6 }}>{label}</span>
        <button type="button" className="button subtle" style={{ minHeight: 32, padding: "4px 10px", fontSize: "0.85em" }} onClick={() => { if (granted) setVisible(true); else setShowGate(true); }}>
          {granted ? <Eye size={13} /> : <ShieldAlert size={13} />}
          {granted ? t("common.sensitiveView") : t("twoFA.sensitiveVerify")}
        </button>
      </span>
    );
  }

  return (
    <div className="sensitive-gate-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowGate(false); }}>
      <div className="sensitive-gate-modal">
        <form onSubmit={handleVerify}>
          <ShieldAlert size={24} className="muted" style={{ marginBottom: 8 }} />
          <strong>{t("twoFA.sensitiveTitle")}</strong>
          <p className="muted" style={{ fontSize: "0.85em", margin: "4px 0 12px" }}>{t("twoFA.sensitiveDesc")}</p>
          <input
            ref={inputRef}
            className="input"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
            placeholder={t("twoFA.verifyPlaceholder")}
            autoComplete="one-time-code"
            required
          />
          {error && <p className="field-error">{error}</p>}
          <div className="sheet-actions" style={{ marginTop: 12 }}>
            <button type="button" className="button secondary" onClick={() => { setShowGate(false); setCode(""); setError(""); }}>{t("common.cancel")}</button>
            <button className="button" disabled={verifying || code.length !== 6}>
              {verifying ? <><span className="spinner" /> {t("common.loading")}</> : t("twoFA.sensitiveVerify")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
