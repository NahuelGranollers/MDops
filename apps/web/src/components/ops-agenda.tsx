"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { ApiError, api, streamUrl, trackClientEvent } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { useTranslation } from "@/lib/i18n/context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AdminCalendar, AgendaSkeleton, UserAgenda } from "@/components/agenda/agenda-calendar";
import { EventDetailSheet } from "@/components/agenda/event-detail-sheet";
import { QuickCreateSheet } from "@/components/agenda/quick-event-sheet";
import { RestConflictDialog } from "@/components/agenda/rest-conflict-dialog";
import { ToastStack } from "@/components/agenda/toast-stack";
import {
  addDays,
  activeSegment,
  assignmentNames,
  dateLabel,
  defaultRoleForSegment,
  defaultSegments,
  defaultDraft,
  enabledSegments,
  hasDraftData,
  makeWindow,
  overlaps,
  personPreference,
  sortPeopleByOpsPreference,
  segmentTypes,
  segmentWindow,
  startOfWeek,
  toDateInput,
  toLocalDateInput,
  toLocalTimeInput,
  type AssignmentDraft,
  type QuickDraft,
  type SegmentType,
  type Toast,
  type ViewMode
} from "@/components/agenda/agenda-utils";

export function OpsAgenda() {
  const searchParams = useSearchParams();
  const { isAdmin } = useSession();
  const { t } = useTranslation();
  const [events, setEvents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [freelancers, setFreelancers] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(new Date());
  const [selected, setSelected] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuickDraft>(defaultDraft());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [minRestHours, setMinRestHours] = useState(10);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [restConflictDialog, setRestConflictDialog] = useState<{ kind: "blocked" | "saved"; conflicts: any[] } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingCancel, setPendingCancel] = useState<any | null>(null);
  const [canceling, setCanceling] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      api<any[]>("/events").then(setEvents).catch(() => setEvents([])),
      api<any[]>("/availability").then(setAvailability).catch(() => setAvailability([])),
      api<any>("/settings").then((settings) => {
        const nextMinRestHours = Number(settings.minRestHours ?? 10);
        setMinRestHours(Number.isFinite(nextMinRestHours) ? nextMinRestHours : 10);
      }).catch(() => setMinRestHours(10)),
      isAdmin ? api<any[]>("/users?assignable=true").then(setUsers).catch(() => setUsers([])) : Promise.resolve(),
      isAdmin ? api<any[]>("/freelancers").then(setFreelancers).catch(() => setFreelancers([])) : Promise.resolve()
    ]).finally(() => setLoading(false));
  }

  useEffect(load, [isAdmin]);

  useEffect(() => {
    const source = new EventSource(streamUrl());
    source.addEventListener("events", load);
    source.addEventListener("availability", load);
    return () => source.close();
  }, [isAdmin]);

  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId || events.length === 0) return;
    const event = events.find((item) => item.id === eventId);
    if (event) setSelected(event);
  }, [events, searchParams]);

  function toast(tone: Toast["tone"], message: string) {
    const id = Date.now();
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3200);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isAdmin) return;
      if (event.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) {
        setDraft(defaultDraft(anchor));
        setCreating(true);
      }
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) {
        event.preventDefault();
        document.getElementById("quick-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, isAdmin]);

  const visibleDays = useMemo(() => {
    if (mode === "day") return [new Date(anchor)];
    if (mode === "list") return [];
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [anchor, mode]);

  const filteredEvents = useMemo(() => {
    const text = query.trim().toLowerCase();
    return events
      .filter((event) => event.status !== "cancelled")
      .filter((event) => !text || `${event.title} ${event.venueName} ${event.city} ${assignmentNames(event)}`.toLowerCase().includes(text))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [events, query]);

  const calendarEvents = useMemo(() => {
    if (mode === "list") return filteredEvents;
    const first = mode === "day" ? new Date(anchor) : visibleDays[0]!;
    const last = mode === "day" ? new Date(anchor) : visibleDays[visibleDays.length - 1]!;
    first.setHours(0, 0, 0, 0);
    last.setHours(23, 59, 59, 999);
    return filteredEvents.filter((event) => {
      const windows = event.segments?.length ? event.segments : [{ startsAt: event.startsAt }];
      return windows.some((segment: any) => {
        const starts = new Date(segment.startsAt);
        return starts >= first && starts <= last;
      });
    });
  }, [anchor, filteredEvents, mode, visibleDays]);

  const draftWindow = useMemo(() => {
    const segment = activeSegment(draft);
    return segment ? segmentWindow(segment) : makeWindow(draft.date, draft.start, draft.end);
  }, [draft]);

  function eventAssignmentWindow(event: any, assignment: any) {
    const segment = assignment.segment ?? event.segments?.find((item: any) => item.id === assignment.segmentId || item.type === assignment.segmentType);
    if (segment) return { startsAt: new Date(segment.startsAt), endsAt: new Date(segment.endsAt) };
    if (assignment.departureAt && assignment.arrivalAt) return { startsAt: new Date(assignment.departureAt), endsAt: new Date(assignment.arrivalAt) };
    return { startsAt: new Date(event.startsAt), endsAt: new Date(event.endsAt) };
  }

  function draftAssignmentWindow(assignment: AssignmentDraft) {
    const segment = enabledSegments(draft).find((item) => item.type === (assignment.segmentType ?? "bolo"));
    return segment ? segmentWindow(segment) : makeWindow(assignment.date, assignment.departure, assignment.arrival);
  }

  function hasRestConflict(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
    const requiredMs = minRestHours * 60 * 60 * 1000;
    const restAfterA = b.startsAt.getTime() - a.endsAt.getTime();
    const restAfterB = a.startsAt.getTime() - b.endsAt.getTime();
    return (restAfterA >= 0 && restAfterA < requiredMs) || (restAfterB >= 0 && restAfterB < requiredMs);
  }

  const peopleSignals = useMemo(() => {
    const unavailableUsers = new Set<string>();
    for (const item of availability) {
      if (item.status === "approved" && overlaps(draftWindow.startsAt, draftWindow.endsAt, new Date(item.startsAt), new Date(item.endsAt))) {
        unavailableUsers.add(item.userId);
      }
    }

    const userAssignmentsByEvent = new Map<string, { startsAt: Date; endsAt: Date }[]>();
    for (const event of events) {
      if (event.id === editingEventId || !event.assignments) continue;
      for (const assignment of event.assignments) {
        if (!assignment.userId) continue;
        const window = eventAssignmentWindow(event, assignment);
        let list = userAssignmentsByEvent.get(assignment.userId);
        if (!list) {
          list = [];
          userAssignmentsByEvent.set(assignment.userId, list);
        }
        list.push(window);
      }
    }

    return users.map((user) => {
      const unavailable = unavailableUsers.has(user.id);
      const draftWindows = draft.assignments.some((assignment) => assignment.userId === user.id)
        ? draft.assignments.filter((assignment) => assignment.userId === user.id).map(draftAssignmentWindow)
        : [draftWindow];
      
      const existingWindows = userAssignmentsByEvent.get(user.id) || [];
      let restConflict = false;
      let assignmentConflict = false;
      
      for (const ew of existingWindows) {
        if (overlaps(draftWindow.startsAt, draftWindow.endsAt, ew.startsAt, ew.endsAt)) {
          assignmentConflict = true;
        }
        for (const dw of draftWindows) {
          if (hasRestConflict(dw, ew)) {
            restConflict = true;
            break;
          }
        }
        if (assignmentConflict && restConflict) break;
      }
      
      return { userId: user.id, unavailable, restConflict, assignmentConflict };
    });
  }, [availability, draft, draftWindow, editingEventId, events, minRestHours, users]);

  const suggestedUsers = useMemo(() => sortPeopleByOpsPreference(users), [users]);

  const hasSavedDraft = hasDraftData(draft);

  function openCreate(date?: Date) {
    trackClientEvent("agenda_open_create", { date: date?.toISOString() ?? anchor.toISOString() });
    setEditingEventId(null);
    setDraft((current) => {
      if (!hasDraftData(current)) return defaultDraft(date ?? anchor);
      if (!date) return current;
      const dateInput = toDateInput(date);
      return {
        ...current,
        date: dateInput,
        segments: (current.segments?.length ? current.segments : defaultSegments(dateInput)).map((segment) => ({ ...segment, date: dateInput }))
      };
    });
    setConflicts([]);
    setCreating(true);
  }

  function dismissQuickCreate() {
    setCreating(false);
    if (hasDraftData(draft)) toast("info", t("events.draftSaved"));
  }

  function discardQuickCreate() {
    setDraft(defaultDraft(anchor));
    setEditingEventId(null);
    setConflicts([]);
    setCreating(false);
  }

  function openEdit(event: any) {
    trackClientEvent("agenda_open_edit", { eventId: event.id });
    setEditingEventId(event.id);
    setSelected(null);
    setConflicts([]);
    const baseDate = toLocalDateInput(event.startsAt);
    const fallbackSegments = defaultSegments(baseDate);
    const segments = segmentTypes.map((type) => {
      const existing = event.segments?.find((segment: any) => segment.type === type);
      const fallback = fallbackSegments.find((segment) => segment.type === type)!;
      return existing ? {
        type,
        enabled: true,
        date: toLocalDateInput(existing.startsAt),
        start: toLocalTimeInput(existing.startsAt, fallback.start),
        end: toLocalTimeInput(existing.endsAt, fallback.end),
        notes: existing.notes ?? ""
      } : fallback;
    });
    const boloSegment = segments.find((segment) => segment.type === "bolo")!;
    setDraft({
      date: boloSegment.date,
      start: boloSegment.start,
      end: boloSegment.end,
      venueName: event.venueName || event.title || "",
      city: event.city || "Barcelona",
      venueAddress: event.venueAddress || "",
      segments,
      activeSegmentType: "bolo",
      assignments: (event.assignments ?? []).map((assignment: any) => ({
        id: assignment.id ?? Math.random().toString(36).slice(2, 9),
        userId: assignment.userId,
        externalName: assignment.externalName ?? "",
        externalPhone: assignment.externalPhone ?? "",
        role: assignment.role,
        segmentType: assignment.segment?.type ?? "bolo",
        saveFreelance: false,
        date: toLocalDateInput(assignment.departureAt ?? event.startsAt),
        departure: toLocalTimeInput(assignment.departureAt, toLocalTimeInput(event.startsAt, "09:00")),
        arrival: toLocalTimeInput(assignment.arrivalAt, toLocalTimeInput(event.endsAt, "18:00")),
        logisticsNotes: assignment.logisticsNotes ?? "",
        expanded: false
      })),
      hotelName: event.hotelName || "",
      gearNotes: event.gearNotes || "",
      visibleNotes: event.visibleNotes || "",
      internalNotes: event.internalNotes || "",
      tags: (event.tags ?? []).join(", ")
    });
    setCreating(true);
  }

  function updateAssignment(userId: string) {
    setDraft((current) => {
      const segment = activeSegment(current);
      const segmentType = segment?.type ?? "bolo";
      const exists = current.assignments.some((item) => item.userId === userId && (item.segmentType ?? "bolo") === segmentType);
      const user = users.find((item) => item.id === userId);
      const preference = user ? personPreference(user) : { role: "technician" };
      
      if (exists) {
        return {
          ...current,
          assignments: current.assignments.filter((item) => !(item.userId === userId && (item.segmentType ?? "bolo") === segmentType))
        };
      }

      return {
        ...current,
        assignments: [...current.assignments, {
          id: Math.random().toString(36).slice(2, 9),
          userId,
          role: defaultRoleForSegment(segmentType, preference.role),
          segmentType,
          saveFreelance: false,
          date: segment?.date ?? current.date,
          departure: segment?.start ?? current.start,
          arrival: segment?.end ?? current.end,
          logisticsNotes: "",
          expanded: true
        }]
      };
    });
  }

  function addSegmentAssignment(userId: string, segmentType: SegmentType) {
    setDraft((current) => {
      const user = users.find((item) => item.id === userId);
      const preference = user ? personPreference(user) : { role: "technician" as AssignmentDraft["role"] };
      const targetSegment = current.segments.find((segment) => segment.type === segmentType) ?? current.segments.find((segment) => segment.type === "bolo");
      
      return {
        ...current,
        activeSegmentType: segmentType,
        segments: current.segments.map((segment) => segment.type === segmentType ? { ...segment, enabled: true } : segment),
        assignments: [...current.assignments, {
          id: Math.random().toString(36).slice(2, 9),
          userId,
          role: defaultRoleForSegment(segmentType, preference.role),
          segmentType,
          saveFreelance: false,
          date: targetSegment?.date ?? current.date,
          departure: targetSegment?.start ?? current.start,
          arrival: targetSegment?.end ?? current.end,
          logisticsNotes: "",
          expanded: true
        }]
      };
    });
  }

  function addFreelanceAssignment(name: string, phone: string, saveFreelance = false) {
    setDraft((current) => ({
      ...current,
      assignments: [...current.assignments, {
        id: Math.random().toString(36).slice(2, 9),
        userId: null,
        externalName: name.trim(),
        externalPhone: phone.trim(),
        role: "support",
        segmentType: activeSegment(current)?.type ?? "bolo",
        saveFreelance,
        date: activeSegment(current)?.date ?? current.date,
        departure: activeSegment(current)?.start ?? current.start,
        arrival: activeSegment(current)?.end ?? current.end,
        logisticsNotes: "",
        expanded: true
      }]
    }));
  }

  function removeAssignment(id: string) {
    setDraft((current) => ({
      ...current,
      assignments: current.assignments.filter((item) => item.id !== id)
    }));
  }

  function patchAssignment(id: string, update: Partial<AssignmentDraft>) {
    setDraft((current) => ({ ...current, assignments: current.assignments.map((item) => {
      if (item.id !== id) return item;
      return { ...item, ...update };
    }) }));
  }

  function buildEventRequest(forceConflicts = false) {
    const optimisticId = `optimistic-${Date.now()}`;
    const segments = enabledSegments(draft);
    const boloSegment = segments.find((segment) => segment.type === "bolo") ?? segments[0] ?? activeSegment(draft);
    const eventWindow = boloSegment ? segmentWindow(boloSegment) : makeWindow(draft.date, draft.start, draft.end);
    const segmentPayload = segments.map((segment) => {
      const segmentTimes = segmentWindow(segment);
      return {
        type: segment.type,
        startsAt: segmentTimes.startsAt.toISOString(),
        endsAt: segmentTimes.endsAt.toISOString(),
        notes: segment.notes || null
      };
    });
    const optimisticEvent = {
      id: optimisticId,
      title: draft.venueName || `Bolo ${draft.city}`,
      startsAt: eventWindow.startsAt.toISOString(),
      endsAt: eventWindow.endsAt.toISOString(),
      city: draft.city,
      venueName: draft.venueName || `Bolo ${draft.city}`,
      venueAddress: draft.venueAddress,
      status: "confirmed",
      segments: segmentPayload,
      assignments: draft.assignments.map((assignment) => ({ ...assignment, id: `${optimisticId}-${assignment.id}`, user: users.find((user) => user.id === assignment.userId), segmentType: assignment.segmentType ?? "bolo" }))
    };

    const title = draft.venueName || `Bolo ${draft.city}`;
    const assignmentPayload = draft.assignments.map((assignment) => {
      const segment = segments.find((item) => item.type === (assignment.segmentType ?? "bolo"));
      const assignmentWindow = segment ? segmentWindow(segment) : makeWindow(assignment.date, assignment.departure, assignment.arrival);
      return {
        userId: assignment.userId || null,
        externalName: assignment.externalName?.trim() || null,
        externalPhone: assignment.externalPhone?.trim() || null,
        role: assignment.role,
        segmentType: assignment.segmentType ?? "bolo",
        saveFreelance: Boolean(assignment.saveFreelance),
        departureAt: assignmentWindow.startsAt.toISOString(),
        arrivalAt: assignmentWindow.endsAt.toISOString(),
        logisticsNotes: assignment.logisticsNotes || null
      };
    });

    return {
      optimisticId,
      optimisticEvent,
      payload: {
        title,
        startsAt: eventWindow.startsAt.toISOString(),
        endsAt: eventWindow.endsAt.toISOString(),
        city: draft.city,
        venueName: draft.venueName || title,
        venueAddress: draft.venueAddress,
        hotelName: draft.hotelName || null,
        hotelAddress: null,
        status: "confirmed",
        segments: segmentPayload,
        gearNotes: draft.gearNotes || null,
        visibleNotes: draft.visibleNotes || null,
        internalNotes: draft.internalNotes || null,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        assignments: assignmentPayload,
        forceConflicts
      }
    };
  }

  async function submitEvent(forceConflicts = false) {
    setSaving(true);
    setConflicts([]);
    setRestConflictDialog(null);
    const { optimisticId, optimisticEvent, payload } = buildEventRequest(forceConflicts);
    if (!editingEventId) setEvents((current) => [...current, optimisticEvent]);
    try {
      const result = await api<any>(editingEventId ? `/events/${editingEventId}` : "/events", {
        method: editingEventId ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      const returnedConflicts = result.conflicts ?? [];
      setConflicts(returnedConflicts);
      setCreating(false);
      setDraft(defaultDraft(anchor));
      setEditingEventId(null);
      trackClientEvent("agenda_event_saved", { editing: Boolean(editingEventId), conflicts: returnedConflicts.length });
      toast("success", t("events.eventSaved"));
      if (returnedConflicts.length > 0) {
        setRestConflictDialog({ kind: "saved", conflicts: returnedConflicts });
      }
      load();
    } catch (error) {
      setEvents((current) => current.filter((item) => item.id !== optimisticId));
      if (error instanceof ApiError && error.status === 409 && Array.isArray(error.payload?.conflicts) && String(error.message).toLowerCase().includes("descanso")) {
        setConflicts(error.payload.conflicts);
        setRestConflictDialog({ kind: "blocked", conflicts: error.payload.conflicts });
        toast("error", t("events.noRestMinimum"));
        return;
      }
      toast("error", error instanceof Error ? error.message : t("events.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  async function saveEvent(event: React.FormEvent) {
    event.preventDefault();
    trackClientEvent("agenda_save_attempt", { editing: Boolean(editingEventId), assignments: draft.assignments.length });
    await submitEvent(false);
  }

  async function duplicateEvent(event: any) {
    try {
      trackClientEvent("agenda_duplicate_event", { eventId: event.id });
      toast("info", t("events.duplicating"));
      await api(`/events/${event.id}/duplicate`, { method: "POST" });
      setSelected(null);
      toast("success", t("events.duplicated"));
      load();
    } catch {
      toast("error", t("events.errorDuplicate"));
    }
  }

  async function cancelEvent(event: any) {
    trackClientEvent("agenda_cancel_event", { eventId: event.id });
    setCanceling(true);
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setSelected(null);
    try {
      await api(`/events/${event.id}`, { method: "DELETE" });
      toast("success", t("events.cancelled"));
      load();
    } catch {
      toast("error", t("events.errorCancel"));
      load();
    } finally {
      setCanceling(false);
      setPendingCancel(null);
    }
  }

  return (
    <div className="agenda-page">
      <section className="agenda-toolbar" aria-label="Agenda">
        <div>
            <div className="eyebrow">{t("events.globalAgenda")}</div>
          <h1>{mode === "day" ? dateLabel(anchor) : mode === "week" ? t("events.weekTitle") : t("events.upcomingTitle")}</h1>
        </div>
        <div className="toolbar-actions">
          <div className="date-stepper">
            <button className="icon-button" onClick={() => setAnchor(addDays(anchor, mode === "day" ? -1 : -7))} aria-label={t("nav.previous")}><ChevronLeft size={18} /></button>
            <input className="date-input" type="date" value={toDateInput(anchor)} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(event) => setAnchor(new Date(`${event.target.value}T12:00:00`))} />
            <button className="icon-button" onClick={() => setAnchor(addDays(anchor, mode === "day" ? 1 : 7))} aria-label={t("nav.next")}><ChevronRight size={18} /></button>
          </div>
          <label className="search-box"><Search size={16} /><input id="quick-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("events.searchPlaceholder")} /></label>
          <div className="segmented">
            {(["day", "week", "list"] as const).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "day" ? t("events.day") : item === "week" ? t("events.week") : t("events.list")}</button>)}
          </div>
          {isAdmin && <button className="button primary-action" onClick={() => openCreate()}><Plus size={18} />{hasSavedDraft ? t("events.continueDraft") : t("events.newEvent")}</button>}
        </div>
      </section>

      {loading ? (
        <AgendaSkeleton />
      ) : isAdmin ? (
        <AdminCalendar mode={mode} days={visibleDays} events={calendarEvents} onCreate={openCreate} onSelect={setSelected} />
      ) : (
        <UserAgenda events={calendarEvents} onSelect={setSelected} />
      )}

      {creating && <QuickCreateSheet title={editingEventId ? t("events.editEvent") : t("events.newEvent")} draft={draft} setDraft={setDraft} users={suggestedUsers} freelancers={freelancers} signals={peopleSignals} minRestHours={minRestHours} onClose={dismissQuickCreate} onDiscard={discardQuickCreate} onSubmit={saveEvent} updateAssignment={updateAssignment} addSegmentAssignment={addSegmentAssignment} addFreelanceAssignment={addFreelanceAssignment} removeAssignment={removeAssignment} patchAssignment={patchAssignment} saving={saving} conflicts={conflicts} />}
      {selected && <EventDetailSheet event={selected} onClose={() => setSelected(null)} onEdit={() => openEdit(selected)} onDuplicate={() => duplicateEvent(selected)} onCancel={() => setPendingCancel(selected)} onUploaded={load} isAdmin={isAdmin} />}
      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title={t("events.cancelDialogTitle")}
        description={t("events.cancelDialogDesc", { name: pendingCancel?.venueName || pendingCancel?.title || "..." })}
        confirmLabel={t("events.cancelDialogConfirm")}
        destructive
        loading={canceling}
        onClose={() => setPendingCancel(null)}
        onConfirm={() => pendingCancel && cancelEvent(pendingCancel)}
      />
      <RestConflictDialog
        open={Boolean(restConflictDialog)}
        title={restConflictDialog?.kind === "blocked" ? t("events.noRestMinimum") : t("events.eventSaved")}
        description={restConflictDialog?.kind === "blocked" ? `Hay personas con menos de ${minRestHours} horas de descanso. Revisa la asignación o guarda igualmente si lo asumes.` : `Se ha guardado el bolo, pero hay personas con menos de ${minRestHours} horas de descanso mínimo.`}
        conflicts={restConflictDialog?.conflicts ?? []}
        loading={saving}
        onClose={() => setRestConflictDialog(null)}
        onConfirm={restConflictDialog?.kind === "blocked" ? () => submitEvent(true) : undefined}
      />
      <ToastStack toasts={toasts} />
    </div>
  );
}
