"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { api, type SessionUser } from "@/lib/api";

type Props = {
  user: SessionUser;
  onClose: () => void;
};

export function EmailNotificationPopup({ user, onClose }: Props) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(user.notificationEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function dismiss() {
    window.localStorage.setItem(`md-ops-email-popup-dismissed:${user.id}`, "true");
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError(t("emailPopup.invalidEmail"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/auth/notification-email", {
        method: "PUT",
        body: JSON.stringify({ notificationEmail: email.trim() })
      });
      window.localStorage.setItem(`md-ops-email-popup-dismissed:${user.id}`, "true");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("emailPopup.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="email-popup-overlay">
      <form className="email-popup" onSubmit={submit}>
        <button type="button" className="email-popup-close" onClick={dismiss} aria-label={t("emailPopup.close")}>
          <X size={18} />
        </button>
        <div className="email-popup-icon">
          <Mail size={32} />
        </div>
        <h2>{t("emailPopup.title")}</h2>
        <p className="muted">{t("emailPopup.description")}</p>
        <label className="field">
          {t("emailPopup.emailLabel")}
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPopup.emailPlaceholder")}
            autoFocus
          />
        </label>
        {error && <div className="badge rejected">{error}</div>}
        <div className="email-popup-actions">
          <button type="button" className="button secondary" onClick={dismiss}>{t("emailPopup.notNow")}</button>
          <button type="submit" className="button" disabled={saving}>
            {saving ? <><span className="spinner" />{t("emailPopup.saving")}</> : <><Mail size={16} />{t("emailPopup.activate")}</>}
          </button>
        </div>
      </form>
    </div>
  );
}
