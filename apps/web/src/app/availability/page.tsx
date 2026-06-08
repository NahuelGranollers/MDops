"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api, streamUrl } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { TimePicker } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";

function toLocalDate(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split("T")[0];
}

function toLocalTime(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().split("T")[1].slice(0, 5);
}

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<AppShell><div className="agenda-page"><div className="event-row skeleton-card" /></div></AppShell>}>
      <AvailabilityContent />
    </Suspense>
  );
}

function AvailabilityContent() {
  const searchParams = useSearchParams();
  const focusedId = searchParams.get("focus");
  const { user, isAdmin } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(toLocalDate(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(toLocalDate(new Date()));
  const [endTime, setEndTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [pendingCancel, setPendingCancel] = useState<any | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  function showFeedback(tone: "success" | "error", message: string) {
    setFeedback({ tone, message });
    window.setTimeout(() => setFeedback(null), 2800);
  }

  function load() {
    setLoading(true);
    api<any[]>("/availability")
      .then((result) => setItems(result.filter((item) => item.status !== "cancelled")))
      .catch(() => {
        setItems([]);
        showFeedback("error", "No se ha podido cargar la indisponibilidad");
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  useEffect(() => {
    const source = new EventSource(streamUrl());
    source.addEventListener("availability", load);
    source.addEventListener("notifications", load);
    return () => source.close();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const startsAt = new Date(`${startDate}T${startTime}:00`).toISOString();
      const endsAt = new Date(`${endDate}T${endTime}:00`).toISOString();
      if (new Date(endsAt) <= new Date(startsAt)) {
        showFeedback("error", "La hora final debe ser posterior al inicio");
        return;
      }
      const body = JSON.stringify({ startsAt, endsAt, reason });
      await api("/availability", { method: "POST", body });
      setReason("");
      showFeedback("success", "Indisponibilidad marcada");
      load();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "No se ha podido marcar");
    } finally {
      setSaving(false);
    }
  }

  async function resolve(id: string, status: "approved" | "rejected") {
    setResolvingId(id);
    try {
      await api(`/availability/${id}/resolve`, { method: "POST", body: JSON.stringify({ status, resolutionComment: "" }) });
      showFeedback("success", status === "approved" ? "Solicitud aprobada" : "Solicitud rechazada");
      load();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "No se ha podido resolver");
    } finally {
      setResolvingId(null);
    }
  }

  async function cancel(item: any) {
    setCanceling(true);
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    try {
      await api(`/availability/${item.id}/cancel`, { method: "POST" });
      showFeedback("success", "Indisponibilidad eliminada");
      load();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "No se ha podido eliminar");
      load();
    } finally {
      setCanceling(false);
      setPendingCancel(null);
    }
  }

  return (
    <AppShell>
      <div className="agenda-page">
        <section className="agenda-toolbar">
          <div>
            <div className="eyebrow">{isAdmin ? "Equipo" : "Personal"}</div>
            <h1>Indisponibilidad</h1>
          </div>
          {feedback && <span className={`inline-alert ${feedback.tone}`}>{feedback.message}</span>}
          <form className="toolbar-actions availability-toolbar" onSubmit={submit}>
            <input className="input" type="date" value={startDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setStartDate(e.target.value)} required />
            <TimePicker value={startTime} onChange={setStartTime} />
            <div className="muted availability-separator">hasta</div>
            <input className="input" type="date" value={endDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setEndDate(e.target.value)} required />
            <TimePicker value={endTime} onChange={setEndTime} />
            <button className="button" disabled={saving}>{saving ? <><span className="spinner" />Marcando</> : "Marcar"}</button>
          </form>
        </section>

        <section className="agenda-list">
          {loading && <div className="event-row skeleton-card" aria-label="Cargando indisponibilidad" />}
          {items.map((item) => (
            <article className={`event-row ${focusedId === item.id ? "is-focused" : ""}`} key={item.id}>
              <div className="date-pill"><strong>{new Date(item.startsAt).getDate()}</strong><span>{new Date(item.startsAt).toLocaleDateString("es-ES", { month: "short" })}</span></div>
              <div>
                <strong>{isAdmin ? item.user?.name : "No disponible"}</strong>
                <div className="muted">{new Date(item.startsAt).toLocaleString("es-ES")} - {new Date(item.endsAt).toLocaleString("es-ES")}</div>
                {item.reason && <div className="muted">{item.reason}</div>}
              </div>
              <StatusBadge value={item.status} />
              <span className="row compact">
                {isAdmin && item.status === "pending" && (
                  <>
                    <button className="button secondary" disabled={resolvingId === item.id} onClick={() => resolve(item.id, "approved")}>Aprobar</button>
                    <button className="button subtle-danger" disabled={resolvingId === item.id} onClick={() => resolve(item.id, "rejected")}>Rechazar</button>
                  </>
                )}
                {item.userId === user?.id && item.status !== "cancelled" && (
                  <>
                    <button className="button secondary" onClick={() => setEditingItem(item)}>Modificar</button>
                    <button className="button subtle-danger" onClick={() => setPendingCancel(item)}>Eliminar</button>
                  </>
                )}
              </span>
            </article>
          ))}
          {!loading && items.length === 0 && <div className="empty-state"><strong>Sin solicitudes.</strong><span>Cuando alguien marque indisponibilidad, aparecerá aquí.</span></div>}
        </section>

        <details className="advanced-block">
          <summary>Motivo opcional</summary>
          <div><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Solo si hace falta explicar algo" /></div>
        </details>
      </div>

      {editingItem && (
        <AvailabilitySheet
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={() => { setEditingItem(null); showFeedback("success", "Cambios guardados"); load(); }}
          onError={(message) => showFeedback("error", message)}
        />
      )}
      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title="Eliminar indisponibilidad"
        description="Se quitará de la lista y dejará de contar como solicitud activa."
        confirmLabel="Eliminar"
        destructive
        loading={canceling}
        onClose={() => setPendingCancel(null)}
        onConfirm={() => pendingCancel && cancel(pendingCancel)}
      />
    </AppShell>
  );
}

function AvailabilitySheet({ item, onClose, onSave, onError }: { item: any; onClose: () => void; onSave: () => void; onError: (message: string) => void }) {
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const start = new Date(item.startsAt);
    const end = new Date(item.endsAt);
    setStartDate(toLocalDate(start));
    setStartTime(toLocalTime(start));
    setEndDate(toLocalDate(end));
    setEndTime(toLocalTime(end));
    setReason(item.reason || "");
  }, [item]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const startsAt = new Date(`${startDate}T${startTime}:00`).toISOString();
      const endsAt = new Date(`${endDate}T${endTime}:00`).toISOString();
      const body = JSON.stringify({ startsAt, endsAt, reason });
      await api(`/availability/${item.id}`, { method: "PUT", body });
      onSave();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <div><span className="eyebrow">Modificar</span><h2>Indisponibilidad</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">&times;</button>
        </div>
        <div className="sheet-body availability-sheet-body scrollbar-hide">
          <div className="quick-grid two">
            <label className="field">Fecha inicio<input className="input" type="date" value={startDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setStartDate(e.target.value)} required /></label>
            <TimePicker label="Hora inicio" value={startTime} onChange={setStartTime} />
          </div>
          <div className="quick-grid two">
            <label className="field">Fecha fin<input className="input" type="date" value={endDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setEndDate(e.target.value)} required /></label>
            <TimePicker label="Hora fin" value={endTime} onChange={setEndTime} />
          </div>
          <label className="field">Motivo
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explica el motivo si es necesario" />
          </label>
        </div>
        <div className="sheet-actions">
          <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
          <button className="button" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
        </div>
      </form>
    </div>
  );
}
