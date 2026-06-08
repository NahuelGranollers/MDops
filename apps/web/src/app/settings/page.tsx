"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api, clearSession } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { UserAvatar } from "@/components/user-avatar";

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  profileColor: string;
  avatarUrl: string | null;
  isActive: boolean;
  roles: { role: { key: string; name: string } }[];
};

type RoleRow = { id: string; key: string; name: string; description: string | null };
type EmailStatus = {
  enabled: boolean;
  configured: boolean;
  missing: string[];
  host: string | null;
  port: number;
  secure: boolean;
  from: string | null;
  fromName: string;
  replyTo: string | null;
};

function roleKeys(user: UserRow) {
  return user.roles.map((item) => item.role.key);
}

function roleLabel(key: string) {
  const labels: Record<string, string> = {
    admin: "Admin",
    technician: "Técnico",
    assembler: "Montador",
    driver: "Transporte",
    support: "Apoyo",
    lead: "Coordinador"
  };
  return labels[key] ?? key;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useSession();
  const canManageSystem = user?.email === "admin@md.local" || user?.email === "ferran@md.local";
  const [minRestHours, setMinRestHours] = useState(10);
  const [restConflictMode, setRestConflictMode] = useState("warn");
  const [timezone, setTimezone] = useState("Europe/Madrid");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [draftUsers, setDraftUsers] = useState<Record<string, { name: string; email: string; phone: string; profileColor: string; isActive: boolean; roleKeys: string[] }>>({});
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "2001", profileColor: "#0f766e", roleKeys: ["technician"] });
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const assignableRoles = useMemo(() => roles.map((role) => ({ key: role.key, name: roleLabel(role.key) })), [roles]);

  function flash(message: string) {
    setSaved(message);
    window.setTimeout(() => setSaved(""), 2500);
  }

  async function load() {
    setLoading(true);
    const [settings, usersResult, rolesResult, emailStatusResult] = await Promise.all([
      api<any>("/settings"),
      api<UserRow[]>("/users"),
      api<{ roles: RoleRow[] }>("/roles"),
      api<EmailStatus>("/settings/email").catch(() => null)
    ]);
    if (settings.minRestHours) setMinRestHours(settings.minRestHours);
    if (settings.restConflictMode) setRestConflictMode(settings.restConflictMode);
    if (settings.timezone) setTimezone(settings.timezone);
    setUsers(usersResult);
    setRoles(rolesResult.roles.filter((role) => role.key !== "admin"));
    setEmailStatus(emailStatusResult);
    if (user?.email && !user.email.toLowerCase().endsWith(".local")) {
      setTestEmail((current) => current || user.email);
    }
    setDraftUsers(Object.fromEntries(usersResult.map((user) => [user.id, {
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      profileColor: user.profileColor ?? "#0f766e",
      isActive: user.isActive,
      roleKeys: roleKeys(user).filter((key) => key !== "admin")
    }])));
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    if (!canManageSystem) {
      setLoading(false);
      return;
    }
    load().catch(() => setLoading(false));
  }, [canManageSystem, user]);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      flash("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 4) {
      flash("La nueva contraseña debe tener al menos 4 caracteres");
      return;
    }
    setSavingPassword(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flash("Contraseña cambiada. Vuelve a entrar.");
      window.setTimeout(() => {
        clearSession();
        router.replace("/login");
      }, 1000);
    } catch (error) {
      flash(error instanceof Error ? error.message : "No se ha podido cambiar la contraseña");
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    await api("/settings", { method: "PUT", body: JSON.stringify({ minRestHours, restConflictMode, timezone }) });
    flash("Ajustes guardados");
  }

  async function sendEmailTest(event: React.FormEvent) {
    event.preventDefault();
    if (!testEmail.trim()) return;
    setSendingTestEmail(true);
    try {
      await api("/settings/email/test", { method: "POST", body: JSON.stringify({ to: testEmail.trim() }) });
      flash("Correo de prueba enviado");
    } catch (error) {
      flash(error instanceof Error ? error.message : "No se ha podido enviar el correo");
    } finally {
      setSendingTestEmail(false);
    }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault();
    await api("/users", {
      method: "POST",
      body: JSON.stringify({
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        profileColor: newUser.profileColor,
        roleKeys: newUser.roleKeys,
        phone: null
      })
    });
    setNewUser({ name: "", email: "", password: "2001", profileColor: "#0f766e", roleKeys: ["technician"] });
    await load();
    flash("Usuario creado");
  }

  async function saveUser(user: UserRow) {
    const draft = draftUsers[user.id];
    await api(`/users/${user.id}`, { method: "PUT", body: JSON.stringify({ ...draft, phone: draft.phone || null }) });
    await load();
    flash("Usuario actualizado");
  }

  async function toggleUser(user: UserRow) {
    await api(`/users/${user.id}/${user.isActive ? "cancel" : "restore"}`, { method: "POST" });
    await load();
    flash(user.isActive ? "Usuario cancelado" : "Usuario restaurado");
  }

  async function deleteUser(user: UserRow) {
    if (!window.confirm(`¿Seguro que quieres eliminar a ${user.name}?`)) return;
    await api(`/users/${user.id}`, { method: "DELETE" });
    await load();
    flash("Usuario eliminado");
  }

  function patchUser(id: string, update: Partial<(typeof draftUsers)[string]>) {
    setDraftUsers((current) => ({ ...current, [id]: { ...current[id], ...update } }));
  }

  function toggleUserRole(id: string, key: string) {
    const current = draftUsers[id]?.roleKeys ?? [];
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    patchUser(id, { roleKeys: next.length ? next : ["support"] });
  }

  return (
    <AppShell>
      <div className="agenda-page">
        <section className="agenda-toolbar">
          <div>
            <div className="eyebrow">{canManageSystem ? "Solo admin y Ferran" : "Cuenta"}</div>
            <h1>Ajustes</h1>
          </div>
          <div className="row compact">
            {saved && <span className="badge approved">{saved}</span>}
          </div>
        </section>

        <form className="card grid profile-form" onSubmit={changePassword}>
          <div className="between">
            <div>
              <h2>Cambiar contraseña</h2>
              <p className="muted">Después tendrás que iniciar sesión de nuevo.</p>
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
            <button className="button" disabled={savingPassword}>{savingPassword ? <><span className="spinner" />Guardando</> : "Cambiar contraseña"}</button>
          </div>
        </form>

        {!canManageSystem && (
          <section className="card empty-state">
            <h2>Todo listo</h2>
            <p className="muted">Los ajustes operativos los gestionan admin y Ferran.</p>
          </section>
        )}

        {canManageSystem && (
        <>
        {loading ? <div className="card skeleton-card" /> : (
          <>
            <form className="card grid" onSubmit={saveSettings}>
              <div className="between"><h2>Operativa</h2><button className="button">Guardar</button></div>
              <div className="quick-grid three">
                <label className="field">Descanso mínimo<input className="input" type="number" min={1} max={24} value={minRestHours} onChange={(e) => setMinRestHours(Number(e.target.value))} /></label>
                <label className="field">Conflictos<select className="select" value={restConflictMode} onChange={(e) => setRestConflictMode(e.target.value)}><option value="warn">Avisar</option><option value="block">Bloquear</option></select></label>
                <label className="field">Zona horaria<input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
              </div>
            </form>

            <section className="card grid">
              <div className="between">
                <h2>Correo</h2>
                <span className={`badge ${emailStatus?.configured ? "approved" : "pending"}`}>{emailStatus?.configured ? "Listo" : "Sin configurar"}</span>
              </div>
              <div className="quick-grid three">
                <label className="field">Servidor<input className="input" value={emailStatus?.host ? `${emailStatus.host}:${emailStatus.port}` : "SMTP pendiente"} readOnly /></label>
                <label className="field">Remitente<input className="input" value={emailStatus?.from ?? ""} readOnly /></label>
                <label className="field">Seguridad<input className="input" value={emailStatus?.secure ? "SSL/TLS" : "STARTTLS"} readOnly /></label>
              </div>
              {!emailStatus?.configured && (
                <div className="conflict-box">Faltan {emailStatus?.missing.join(", ") || "datos SMTP"} en .env.</div>
              )}
              <form className="management-row new-user-row" onSubmit={sendEmailTest}>
                <input className="input" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="correo real para prueba" type="email" required />
                <button className="button" disabled={!emailStatus?.configured || sendingTestEmail}>
                  {sendingTestEmail ? <><span className="spinner" />Enviando</> : <><Mail size={16} />Enviar prueba</>}
                </button>
              </form>
            </section>

            <section className="card grid">
              <div className="between"><h2>Equipo</h2><span className="muted">Roles de trabajo</span></div>

              <form className="management-row new-user-row" onSubmit={createUser}>
                <input className="input" value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre" required />
                <input className="input" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="usuario@md.local" type="email" required />
                <input className="input color-input compact-color" type="color" value={newUser.profileColor} onChange={(event) => setNewUser((current) => ({ ...current, profileColor: event.target.value }))} aria-label="Color de usuario" />
                <select className="select" value={newUser.roleKeys[0]} onChange={(event) => setNewUser((current) => ({ ...current, roleKeys: [event.target.value] }))}>
                  {assignableRoles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                </select>
                <button className="button"><UserPlus size={16} />Crear</button>
              </form>

              <div className="management-list simple-management-list">
                {users.filter((user) => user.email !== "admin@md.local").map((user) => {
                  const draft = draftUsers[user.id];
                  if (!draft) return null;
                  return (
                    <article className={`management-row ${user.isActive ? "" : "is-muted"}`} key={user.id}>
                      <div className="user-management-name">
                        <UserAvatar user={{ ...user, profileColor: draft.profileColor }} size="sm" />
                        <input className="input" value={draft.name} onChange={(event) => patchUser(user.id, { name: event.target.value })} />
                      </div>
                      <input className="input" value={draft.email} onChange={(event) => patchUser(user.id, { email: event.target.value })} />
                      <input className="input color-input compact-color" type="color" value={draft.profileColor} onChange={(event) => patchUser(user.id, { profileColor: event.target.value })} aria-label={`Color de ${user.name}`} />
                      <div className="role-pills">
                        {assignableRoles.map((role) => <button type="button" className={draft.roleKeys.includes(role.key) ? "active" : ""} key={role.key} onClick={() => toggleUserRole(user.id, role.key)}>{role.name}</button>)}
                      </div>
                      <div className="row compact">
                        <span className={`badge ${user.isActive ? "approved" : "cancelled"}`}>{user.isActive ? "Activo" : "Cancelado"}</span>
                        <button className="button secondary" type="button" onClick={() => saveUser(user)}>Guardar</button>
                        <button className="button secondary" type="button" onClick={() => toggleUser(user)}>{user.isActive ? "Cancelar" : "Restaurar"}</button>
                        <button className="button subtle-danger" type="button" onClick={() => deleteUser(user)}>Eliminar</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
        </>
        )}
      </div>
    </AppShell>
  );
}
