"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { api, streamUrl } from "@/lib/api";
import { BrowserAPI } from "@/lib/browser-api";
import { useSession } from "@/lib/use-session";
import { useTranslation } from "@/lib/i18n/context";
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
  const { t } = useTranslation();
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
    BrowserAPI.setTimeout(() => setFeedback(null), 2800);
  }

  function load() {
    setLoading(true);
    api<any[]>("/availability")
      .then((result) => setItems(result.filter((item) => item.status !== "cancelled")))
      .catch(() => {
        setItems([]);
        showFeedback("error", t("availability.errorLoad"));
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
        showFeedback("error", t("availability.timeError"));
        return;
      }
      const body = JSON.stringify({ startsAt, endsAt, reason });
      await api("/availability", { method: "POST", body });
      setReason("");
      showFeedback("success", t("availability.marked"));
      load();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("availability.errorMark"));
    } finally {
      setSaving(false);
    }
  }

  async function resolve(id: string, status: "approved" | "rejected") {
    setResolvingId(id);
    try {
      await api(`/availability/${id}/resolve`, { method: "POST", body: JSON.stringify({ status, resolutionComment: "" }) });
      showFeedback("success", status === "approved" ? t("availability.approved") : t("availability.rejected"));
      load();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("availability.errorResolve"));
    } finally {
      setResolvingId(null);
    }
  }

  async function cancel(item: any) {
    setCanceling(true);
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    try {
      await api(`/availability/${item.id}/cancel`, { method: "POST" });
      showFeedback("success", t("availability.deleted"));
      load();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("availability.errorDelete"));
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
            <div className="eyebrow">{isAdmin ? t("availability.team") : t("availability.personal")}</div>
            <h1>{t("availability.title")}</h1>
          </div>
          {feedback && <span className={`inline-alert ${feedback.tone}`}>{feedback.message}</span>}
          <form className="toolbar-actions availability-toolbar" onSubmit={submit}>
            <input className="input" type="date" value={startDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setStartDate(e.target.value)} required />
            <TimePicker value={startTime} onChange={setStartTime} />
            <div className="muted availability-separator">{t("availability.from")}</div>
            <input className="input" type="date" value={endDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setEndDate(e.target.value)} required />
            <TimePicker value={endTime} onChange={setEndTime} />
            <button className="button" disabled={saving}>{saving ? <><span className="spinner" />{t("availability.marking")}</> : t("availability.mark")}</button>
          </form>
        </section>

        <section className="agenda-list">
          {loading && <div className="event-row skeleton-card" aria-label={t("availability.loading")} />}
          {items.map((item) => (
            <article className={`event-row ${focusedId === item.id ? "is-focused" : ""}`} key={item.id}>
              <div className="date-pill"><strong>{new Date(item.startsAt).getDate()}</strong><span>{new Date(item.startsAt).toLocaleDateString("es-ES", { month: "short" })}</span></div>
              <div>
                <strong>{isAdmin ? item.user?.name : t("availability.notAvailable")}</strong>
                <div className="muted">{new Date(item.startsAt).toLocaleString("es-ES")} - {new Date(item.endsAt).toLocaleString("es-ES")}</div>
                {item.reason && <div className="muted">{item.reason}</div>}
              </div>
              <StatusBadge value={item.status} />
              <span className="row compact">
                {isAdmin && item.status === "pending" && (
                  <>
                    <button className="button secondary" disabled={resolvingId === item.id} onClick={() => resolve(item.id, "approved")}>{t("availability.approve")}</button>
                    <button className="button subtle-danger" disabled={resolvingId === item.id} onClick={() => resolve(item.id, "rejected")}>{t("availability.reject")}</button>
                  </>
                )}
                {item.userId === user?.id && item.status !== "cancelled" && (
                  <>
                    <button className="button secondary" onClick={() => setEditingItem(item)}>{t("availability.modify")}</button>
                    <button className="button subtle-danger" onClick={() => setPendingCancel(item)}>{t("availability.delete")}</button>
                  </>
                )}
              </span>
            </article>
          ))}
          {!loading && items.length === 0 && <div className="empty-state"><strong>{t("availability.noRequests")}</strong><span>{t("availability.noRequestsDesc")}</span></div>}
        </section>

        <details className="advanced-block">
          <summary>{t("availability.optionalReason")}</summary>
          <div><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("availability.reasonPlaceholder")} /></div>
        </details>
      </div>

      {editingItem && (
        <AvailabilitySheet
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={() => { setEditingItem(null); showFeedback("success", t("availability.changesSaved")); load(); }}
          onError={(message) => showFeedback("error", message)}
        />
      )}
      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title={t("availability.dialogTitle")}
        description={t("availability.dialogDesc")}
        confirmLabel={t("availability.dialogConfirm")}
        destructive
        loading={canceling}
        onClose={() => setPendingCancel(null)}
        onConfirm={() => pendingCancel && cancel(pendingCancel)}
      />
    </AppShell>
  );
}

function AvailabilitySheet({ item, onClose, onSave, onError }: { item: any; onClose: () => void; onSave: () => void; onError: (message: string) => void }) {
  const { t } = useTranslation();
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
      onError(e instanceof Error ? e.message : t("availability.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={submit}>
        <div className="sheet-head">
          <div><span className="eyebrow">{t("availability.sheetModify")}</span><h2>{t("availability.sheetTitle")}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("availability.sheetClose")}>&times;</button>
        </div>
        <div className="sheet-body availability-sheet-body scrollbar-hide">
          <div className="quick-grid two">
            <label className="field">{t("availability.sheetStartDate")}<input className="input" type="date" value={startDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setStartDate(e.target.value)} required /></label>
            <TimePicker label={t("availability.sheetStartTime")} value={startTime} onChange={setStartTime} />
          </div>
          <div className="quick-grid two">
            <label className="field">{t("availability.sheetEndDate")}<input className="input" type="date" value={endDate} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(e) => setEndDate(e.target.value)} required /></label>
            <TimePicker label={t("availability.sheetEndTime")} value={endTime} onChange={setEndTime} />
          </div>
          <label className="field">{t("availability.sheetReason")}
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("availability.sheetReasonPlaceholder")} />
          </label>
        </div>
        <div className="sheet-actions">
          <button type="button" className="button secondary" onClick={onClose}>{t("availability.cancel")}</button>
          <button className="button" disabled={saving}>{saving ? t("availability.saving") : t("availability.saveChanges")}</button>
        </div>
      </form>
    </div>
  );
}
