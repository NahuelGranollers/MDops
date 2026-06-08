"use client";

import { useState } from "react";
import { Mail, X } from "lucide-react";
import { api, type SessionUser } from "@/lib/api";

type Props = {
  user: SessionUser;
  onClose: () => void;
};

export function EmailNotificationPopup({ user, onClose }: Props) {
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
      setError("Introduce un email válido.");
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
      setError(err instanceof Error ? err.message : "No se ha podido guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="email-popup-overlay">
      <form className="email-popup" onSubmit={submit}>
        <button type="button" className="email-popup-close" onClick={dismiss} aria-label="Cerrar">
          <X size={18} />
        </button>
        <div className="email-popup-icon">
          <Mail size={32} />
        </div>
        <h2>¿Quieres recibir notificaciones por email?</h2>
        <p className="muted">Recibirás avisos de asignaciones, cambios de horario y más directamente en tu correo.</p>
        <label className="field">
          Email para notificaciones
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoFocus
          />
        </label>
        {error && <div className="badge rejected">{error}</div>}
        <div className="email-popup-actions">
          <button type="button" className="button secondary" onClick={dismiss}>Ahora no</button>
          <button type="submit" className="button" disabled={saving}>
            {saving ? <><span className="spinner" />Guardando</> : <><Mail size={16} />Activar notificaciones</>}
          </button>
        </div>
      </form>
    </div>
  );
}
