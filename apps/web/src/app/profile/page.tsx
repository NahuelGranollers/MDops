"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api, clearSession } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { UserAvatar } from "@/components/user-avatar";
import type { SessionUser } from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const { user } = useSession();
  const [profileUser, setProfileUser] = useState<SessionUser | null>(null);
  const [profileColor, setProfileColor] = useState("#0f766e");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (user) {
      setProfileUser(user);
      setProfileColor(user.profileColor || "#0f766e");
    }
  }, [user]);

  function showFeedback(tone: "success" | "error", message: string) {
    setFeedback({ tone, message });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      showFeedback("error", "Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 4) {
      showFeedback("error", "La nueva contraseña debe tener al menos 4 caracteres");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showFeedback("success", "Contraseña cambiada. Vuelve a entrar con la nueva.");
      window.setTimeout(() => {
        clearSession();
        router.replace("/login");
      }, 1200);
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "No se ha podido cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const result = await api<{ user: SessionUser }>("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({ profileColor })
      });
      setProfileUser(result.user);
      showFeedback("success", "Perfil actualizado");
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "No se ha podido guardar el perfil");
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    setSavingProfile(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await api<{ user: SessionUser }>("/auth/avatar", { method: "POST", body });
      setProfileUser(result.user);
      showFeedback("success", "Foto actualizada");
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "No se ha podido subir la foto");
    } finally {
      setSavingProfile(false);
    }
  }

  async function removeAvatar() {
    setSavingProfile(true);
    try {
      const result = await api<{ user: SessionUser }>("/auth/avatar", { method: "DELETE" });
      setProfileUser(result.user);
      showFeedback("success", "Foto eliminada");
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "No se ha podido eliminar la foto");
    } finally {
      setSavingProfile(false);
    }
  }

  const displayUser = profileUser ?? user;

  return (
    <AppShell>
      <div className="agenda-page">
        <section className="agenda-toolbar">
          <div>
            <div className="eyebrow">Cuenta</div>
            <h1>Perfil</h1>
          </div>
          {feedback && <span className={`inline-alert ${feedback.tone}`}>{feedback.message}</span>}
        </section>

        <section className="card profile-card">
          <div className="profile-summary">
            <UserAvatar user={displayUser ? { ...displayUser, profileColor } : { name: "MD", profileColor }} size="lg" />
            <div>
              <h2>{displayUser?.name ?? "Usuario"}</h2>
              <p className="muted">{displayUser?.email}</p>
            </div>
          </div>
        </section>

        <form className="card grid profile-form" onSubmit={saveProfile}>
          <div className="between">
            <div>
              <h2>Foto y color</h2>
              <p className="muted">Se usa en agenda, asignaciones y equipo.</p>
            </div>
          </div>
          <div className="profile-visual-grid">
            <label className="field">Color
              <input className="input color-input" type="color" value={profileColor} onChange={(event) => setProfileColor(event.target.value)} />
            </label>
            <label className="field">Foto
              <input className="input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => uploadAvatar(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div className="sheet-actions">
            {displayUser?.avatarUrl && <button type="button" className="button subtle-danger" onClick={removeAvatar} disabled={savingProfile}>Quitar foto</button>}
            <button className="button" disabled={savingProfile}>{savingProfile ? <><span className="spinner" />Guardando</> : "Guardar perfil"}</button>
          </div>
        </form>

        <form className="card grid profile-form" onSubmit={submit}>
          <div className="between">
            <div>
              <h2>Cambiar contraseña</h2>
              <p className="muted">Por seguridad, tendrás que iniciar sesión de nuevo.</p>
            </div>
            <KeyRound size={20} className="muted" />
          </div>
          <label className="field">Contraseña actual
            <input className="input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <div className="quick-grid two">
            <label className="field">Nueva contraseña
              <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            <label className="field">Repetir contraseña
              <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </label>
          </div>
          <div className="sheet-actions">
            <button className="button" disabled={saving}>{saving ? <><span className="spinner" />Guardando</> : "Cambiar contraseña"}</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
