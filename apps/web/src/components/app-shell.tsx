"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarDays, Globe, Moon, Settings, UserCheck, LogOut, MoreHorizontal, UserRound } from "lucide-react";
import { api, clearSession, streamUrl } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { useTranslation } from "@/lib/i18n/context";
import { UserAvatar } from "@/components/user-avatar";
import { SessionErrorLogger } from "@/components/session-error-logger";
import { EmailNotificationPopup } from "./email-notification-popup";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAdmin } = useSession();
  const { t, locale, setLocale } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [showEmailPopup, setShowEmailPopup] = useState(false);
  const links: readonly (readonly [string, string, any])[] = [
    ["/events", t("nav.agenda"), CalendarDays],
    ["/availability", t("nav.availability"), UserCheck],
    ["/notifications", t("nav.notifications"), Bell],
    ["/settings", t("nav.settings"), Settings]
  ];
  const mobileLinks = links.filter(([href]) => href !== "/settings");

  function applyTheme(nextTheme: "light" | "dark") {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setTheme(nextTheme);
    if (user) window.localStorage.setItem(`md-ops-theme:${user.id}`, nextTheme);
  }

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    const savedTheme = window.localStorage.getItem(`md-ops-theme:${user.id}`);
    const nextTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    setTheme(nextTheme);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (user.notificationEmail) return;
    const dismissed = window.localStorage.getItem(`md-ops-email-popup-dismissed:${user.id}`);
    if (dismissed) return;
    const timer = window.setTimeout(() => setShowEmailPopup(true), 1500);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (user) {
      api<any[]>("/notifications").then((items) => {
        setUnreadCount(items.filter(i => !i.readAt).length);
      }).catch(() => {});
    }
  }, [user, pathname]); // Re-fetch on path change to update if they just visited notifications

  useEffect(() => {
    if (!user) return;
    const source = new EventSource(streamUrl());
    const refresh = () => {
      api<any[]>("/notifications")
        .then((items) => setUnreadCount(items.filter((item) => !item.readAt).length))
        .catch(() => {});
    };
    source.addEventListener("notifications", refresh);
    source.addEventListener("availability", refresh);
    source.addEventListener("events", refresh);
    return () => source.close();
  }, [user]);

  if (loading) return (
    <div className="ops-shell">
      <SessionErrorLogger />
      <header className="ops-header">
        <Link href="/events" className="ops-brand">{t("app.name")}</Link>
      </header>
      <main className="ops-main"><div className="card skeleton-card" aria-label={t("nav.loading")} /></main>
    </div>
  );
  if (!user) return <main className="main"><div className="card">{t("nav.redirecting")}</div></main>;

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="ops-shell">
      <header className="ops-header">
        <Link href="/events" className="ops-brand">{t("app.name")}</Link>
        <nav className="ops-nav" aria-label={t("nav.mainNavAria")}>
          {links.slice(0, isAdmin ? 4 : 3).map(([href, label, Icon]) => (
            <Link key={href} href={href} className={pathname === href ? "active" : ""}>
              <div className="icon-with-badge">
                <Icon size={17} />
                {href === "/notifications" && unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
              </div>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ops-profile">
          <UserAvatar user={user} size="sm" />
          <span>{user.name}</span>
          <button className="icon-button" onClick={() => setLocale(locale === "ca" ? "es" : "ca")} aria-label="Idioma"><Globe size={17} /></button>
          <button className="icon-button" onClick={() => applyTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}><Moon size={17} /></button>
          <details className="profile-menu">
            <summary aria-label={t("nav.moreOptions")}><MoreHorizontal size={18} /></summary>
            <div>
              <Link href="/profile"><UserRound size={16} />{t("nav.profile")}</Link>
              <Link href="/settings"><Settings size={16} />{t("nav.settings")}</Link>
              <button onClick={logout}><LogOut size={16} />{t("nav.logout")}</button>
            </div>
          </details>
        </div>
      </header>
      <main className="ops-main">
        {children}
      </main>
      <nav className="mobile-tabs">
        {mobileLinks.map(([href, label, Icon]) => (
          <Link key={href} href={href} className={pathname === href ? "active" : ""} aria-label={label}>
            <div className="icon-with-badge">
              <Icon size={18} />
              {href === "/notifications" && unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
            </div>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {showEmailPopup && user && (
        <EmailNotificationPopup user={user} onClose={() => setShowEmailPopup(false)} />
      )}
    </div>
  );
}
