"use client";

import { useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api, clearSession } from "@/lib/api";
import { BrowserAPI } from "@/lib/browser-api";
import { useSession } from "@/lib/use-session";
import { useTranslation } from "@/lib/i18n/context";
import { UserAvatar } from "@/components/user-avatar";
import { SensitiveDataGate } from "@/components/sensitive-data-gate";

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

function roleLabel(key: string, t: (k: string) => string) {
  const labels: Record<string, string> = {
    admin: t("roles.admin"),
    technician: t("roles.technician"),
    assembler: t("roles.assembler"),
    driver: t("roles.driver"),
    support: t("roles.support"),
    lead: t("roles.coordinator")
  };
  return labels[key] ?? key;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useSession();
  const { t } = useTranslation();
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

  const assignableRoles = useMemo(() => roles.map((role) => ({ key: role.key, name: roleLabel(role.key, t) })), [roles, t]);

  function flash(message: string) {
    setSaved(message);
    BrowserAPI.setTimeout(() => setSaved(""), 2500);
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
    setRoles(rolesResult.roles.filter((role) => role.key !== "admin" && role.key !== "pissarra"));
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
      roleKeys: roleKeys(user).filter((key) => key !== "admin" && key !== "pissarra")
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
      flash(t("settings.passwordMismatch"));
      return;
    }
    if (newPassword.length < 4) {
      flash(t("settings.passwordTooShort"));
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
      flash(t("settings.passwordChanged"));
      BrowserAPI.setTimeout(() => {
        clearSession();
        router.replace("/login");
      }, 1000);
    } catch (error) {
      flash(error instanceof Error ? error.message : t("settings.passwordError"));
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    await api("/settings", { method: "PUT", body: JSON.stringify({ minRestHours, restConflictMode, timezone }) });
    flash(t("settings.savedSettings"));
  }

  async function sendEmailTest(event: React.FormEvent) {
    event.preventDefault();
    if (!testEmail.trim()) return;
    setSendingTestEmail(true);
    try {
      await api("/settings/email/test", { method: "POST", body: JSON.stringify({ to: testEmail.trim() }) });
      flash(t("settings.emailTestSent"));
    } catch (error) {
      flash(error instanceof Error ? error.message : t("settings.emailTestError"));
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
    flash(t("settings.userCreated"));
  }

  async function saveUser(user: UserRow) {
    const draft = draftUsers[user.id];
    await api(`/users/${user.id}`, { method: "PUT", body: JSON.stringify({ ...draft, phone: draft.phone || null }) });
    await load();
    flash(t("settings.userUpdated"));
  }

  async function toggleUser(user: UserRow) {
    await api(`/users/${user.id}/${user.isActive ? "cancel" : "restore"}`, { method: "POST" });
    await load();
    flash(user.isActive ? t("settings.userCancelled") : t("settings.userRestored"));
  }

  async function deleteUser(user: UserRow) {
    if (!BrowserAPI.confirm(t("settings.deleteConfirm", { name: user.name }))) return;
    await api(`/users/${user.id}`, { method: "DELETE" });
    await load();
    flash(t("settings.userDeleted"));
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
            <div className="eyebrow">{canManageSystem ? t("settings.onlyAdminFerran") : t("settings.account")}</div>
            <h1>{t("settings.title")}</h1>
          </div>
          <div className="row compact">
            {saved && <span className="badge approved">{saved}</span>}
          </div>
        </section>

        <form className="card grid profile-form" onSubmit={changePassword}>
          <div className="between">
            <div>
              <h2>{t("settings.changePassword")}</h2>
              <p className="muted">{t("settings.changePasswordHint")}</p>
            </div>
            <KeyRound size={20} className="muted" />
          </div>
          <label className="field">{t("settings.currentPassword")}
            <input className="input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <div className="quick-grid two">
            <label className="field">{t("settings.newPassword")}
              <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            <label className="field">{t("settings.confirmPassword")}
              <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </label>
          </div>
          <div className="sheet-actions">
            <button className="button" disabled={savingPassword}>{savingPassword ? <><span className="spinner" />{t("settings.saving")}</> : t("settings.changePasswordBtn")}</button>
          </div>
        </form>

        {!canManageSystem && (
          <section className="card empty-state">
            <h2>{t("settings.allSet")}</h2>
            <p className="muted">{t("settings.allSetDesc")}</p>
          </section>
        )}

        {canManageSystem && (
        <>
        {loading ? <div className="card skeleton-card" /> : (
          <>
            <form className="card grid" onSubmit={saveSettings}>
              <div className="between"><h2>{t("settings.operations")}</h2><button className="button">{t("settings.save")}</button></div>
              <div className="quick-grid three">
                <label className="field">{t("settings.minRest")}<input className="input" type="number" min={1} max={24} value={minRestHours} onChange={(e) => setMinRestHours(Number(e.target.value))} /></label>
                <label className="field">{t("settings.conflicts")}<select className="select" value={restConflictMode} onChange={(e) => setRestConflictMode(e.target.value)}><option value="warn">{t("settings.warn")}</option><option value="block">{t("settings.block")}</option></select></label>
                <label className="field">{t("settings.timezone")}<input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
              </div>
            </form>

            <section className="card grid">
              <div className="between">
                <h2>{t("settings.email")}</h2>
                <span className={`badge ${emailStatus?.configured ? "approved" : "pending"}`}>{emailStatus?.configured ? t("settings.ready") : t("settings.notConfigured")}</span>
              </div>
              <div className="quick-grid three">
                <label className="field">{t("settings.server")}<input className="input" value={emailStatus?.host ? `${emailStatus.host}:${emailStatus.port}` : t("settings.smtpPending")} readOnly /></label>
                <label className="field">{t("settings.sender")}<input className="input" value={emailStatus?.from ?? ""} readOnly /></label>
                <label className="field">{t("settings.security")}<input className="input" value={emailStatus?.secure ? t("settings.securitySSL") : t("settings.securitySTARTTLS")} readOnly /></label>
              </div>
              {!emailStatus?.configured && (
                <div className="conflict-box">{t("settings.missingSMTP", { vars: emailStatus?.missing.join(", ") || "SMTP" })}</div>
              )}
              <form className="management-row new-user-row" onSubmit={sendEmailTest}>
                <input className="input" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder={t("settings.testEmailPlaceholder")} type="email" required />
                <button className="button" disabled={!emailStatus?.configured || sendingTestEmail}>
                  {sendingTestEmail ? <><span className="spinner" />{t("settings.sending")}</> : <><Mail size={16} />{t("settings.sendTest")}</>}
                </button>
              </form>
            </section>

            <section className="card grid">
              <div className="between"><h2>{t("settings.team")}</h2><span className="muted">{t("settings.roleLabels")}</span></div>

              <form className="management-row new-user-row" onSubmit={createUser}>
                <input className="input" value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder={t("settings.namePlaceholder")} required />
                <input className="input" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder={t("settings.emailPlaceholder")} type="email" required />
                <input className="input color-input compact-color" type="color" value={newUser.profileColor} onChange={(event) => setNewUser((current) => ({ ...current, profileColor: event.target.value }))} aria-label={t("settings.userColorAria")} />
                <select className="select" value={newUser.roleKeys[0]} onChange={(event) => setNewUser((current) => ({ ...current, roleKeys: [event.target.value] }))}>
                  {assignableRoles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}
                </select>
                <button className="button"><UserPlus size={16} />{t("settings.create")}</button>
              </form>

              <div className="management-list simple-management-list">
                {users.filter((user) => user.email !== "admin@md.local" && user.email !== "pissarra@md.local").map((user) => {
                  const draft = draftUsers[user.id];
                  if (!draft) return null;
                  return (
                    <article className={`management-row ${user.isActive ? "" : "is-muted"}`} key={user.id}>
                      <div className="user-management-name">
                        <UserAvatar user={{ ...user, profileColor: draft.profileColor }} size="sm" />
                        <input className="input" value={draft.name} onChange={(event) => patchUser(user.id, { name: event.target.value })} />
                      </div>
                      <SensitiveDataGate>
                        <input className="input" value={draft.email} onChange={(event) => patchUser(user.id, { email: event.target.value })} />
                      </SensitiveDataGate>
                      <SensitiveDataGate>
                        <input className="input" value={draft.phone} onChange={(event) => patchUser(user.id, { phone: event.target.value })} placeholder={t("settings.phonePlaceholder")} />
                      </SensitiveDataGate>
                      <input className="input color-input compact-color" type="color" value={draft.profileColor} onChange={(event) => patchUser(user.id, { profileColor: event.target.value })} aria-label={t("settings.colorAria", { name: user.name })} />
                      <div className="role-pills">
                        {assignableRoles.map((role) => <button type="button" className={draft.roleKeys.includes(role.key) ? "active" : ""} key={role.key} onClick={() => toggleUserRole(user.id, role.key)}>{role.name}</button>)}
                      </div>
                      <div className="row compact">
                        <span className={`badge ${user.isActive ? "approved" : "cancelled"}`}>{user.isActive ? t("settings.active") : t("settings.cancelled")}</span>
                        <button className="button secondary" type="button" onClick={() => saveUser(user)}>{t("settings.saveUser")}</button>
                        <button className="button secondary" type="button" onClick={() => toggleUser(user)}>{user.isActive ? t("settings.cancelUser") : t("settings.restoreUser")}</button>
                        <button className="button subtle-danger" type="button" onClick={() => deleteUser(user)}>{t("settings.deleteUser")}</button>
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
