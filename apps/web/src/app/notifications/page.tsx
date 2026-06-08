"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { api, streamUrl } from "@/lib/api";
import { Bell, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api<any[]>("/notifications");
      setItems(data);
      // Mark unread as read
      const unread = data.filter(i => !i.readAt);
      for (const item of unread) {
        api(`/notifications/${item.id}/read`, { method: "POST" }).catch(() => {});
      }
    } catch (e) {
      setItems([]);
      setError("No se han podido cargar los avisos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const source = new EventSource(streamUrl());
    const reload = () => load();
    source.addEventListener("notifications", reload);
    source.addEventListener("availability", reload);
    source.addEventListener("events", reload);
    return () => source.close();
  }, []);

  function hrefFor(item: any) {
    if (!item.entityId) return "/notifications";
    if (item.type === "assignment" || item.type === "schedule_change" || item.type === "logistics_change" || item.type === "cancellation") {
      return `/events?event=${encodeURIComponent(item.entityId)}`;
    }
    if (item.type === "availability_resolution") {
      return `/availability?focus=${encodeURIComponent(item.entityId)}`;
    }
    return "/notifications";
  }

  return (
    <AppShell>
      <div className="agenda-page">
        <section className="agenda-toolbar">
          <div>
            <div className="eyebrow">Sistema</div>
            <h1>Avisos</h1>
          </div>
        </section>

        <section className="agenda-list">
          {error && <div className="inline-alert error">{error}</div>}
          {loading && <div className="event-row skeleton-card" aria-label="Cargando avisos" />}
          {items.map((item) => (
            <Link key={item.id} href={hrefFor(item)} className={`event-row notification-row notification-link ${!item.readAt ? "is-new" : ""}`} onClick={() => api(`/notifications/${item.id}/read`, { method: "POST" }).catch(() => {})}>
              <div className={`date-pill notification-icon ${!item.readAt ? "unread" : ""}`}>
                <Bell size={20} />
              </div>
              <div>
                <div className="between notification-title-row">
                  <strong>{item.title}</strong>
                  <StatusBadge value={item.type} />
                </div>
                <p className="notification-body">{item.body}</p>
                <div className="muted notification-date">{new Date(item.createdAt).toLocaleString("es-ES")}</div>
              </div>
              {!item.readAt && <span className="status-dot confirmed" title="Nueva" />}
            </Link>
          ))}
          {!loading && items.length === 0 && !error && (
            <div className="empty-state">
              <CheckCircle2 size={32} className="muted" />
              <strong>Todo al día.</strong>
              <span>No tienes avisos pendientes por ahora.</span>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
