export type ViewMode = "day" | "week" | "list";
export type SegmentType = "prueba" | "montaje" | "bolo" | "desmontaje";

export type ScheduleSegmentDraft = {
  type: SegmentType;
  enabled: boolean;
  date: string;
  start: string;
  end: string;
  notes: string;
};

export type AssignmentDraft = {
  id: string;
  userId?: string | null;
  externalName?: string;
  externalPhone?: string;
  role: string;
  segmentType?: SegmentType;
  saveFreelance?: boolean;
  date: string;
  departure: string;
  arrival: string;
  logisticsNotes: string;
  expanded?: boolean;
};

export type QuickDraft = {
  date: string;
  start: string;
  end: string;
  venueName: string;
  city: string;
  venueAddress: string;
  segments: ScheduleSegmentDraft[];
  activeSegmentType: SegmentType;
  assignments: AssignmentDraft[];
  hotelName: string;
  gearNotes: string;
  visibleNotes: string;
  internalNotes: string;
  tags: string;
};

export type Toast = { id: number; tone: "success" | "error" | "info"; message: string };

export const roles = [
  ["technician", "Técnico"],
  ["assembler", "Montador"],
  ["driver", "Transporte"],
  ["pickup_teardown", "Recogida/desmontaje"],
  ["support", "Apoyo"]
] as const;

export const roleLabels = Object.fromEntries(roles) as Record<string, string>;

export const segmentTypes: SegmentType[] = ["bolo", "montaje", "prueba", "desmontaje"];

export const segmentLabels: Record<SegmentType, string> = {
  prueba: "Pruebas",
  montaje: "Montaje",
  bolo: "Bolo",
  desmontaje: "Desmontaje"
};

export const segmentShortLabels: Record<SegmentType, string> = {
  prueba: "Pruebas",
  montaje: "Montaje",
  bolo: "Bolo",
  desmontaje: "Desmontaje"
};

export const segmentClassNames: Record<SegmentType, string> = {
  prueba: "segment-prueba",
  montaje: "segment-montaje",
  bolo: "segment-bolo",
  desmontaje: "segment-desmontaje"
};

export const segmentOrder = Object.fromEntries(segmentTypes.map((type, index) => [type, index])) as Record<SegmentType, number>;


export function segmentClassName(type: string | null | undefined) {
  return type && type in segmentClassNames ? segmentClassNames[type as SegmentType] : "segment-bolo";
}

export function sortSegmentsByOpsOrder<T extends { type?: string | null }>(segments: T[]) {
  return [...segments].sort((a, b) => {
    const aOrder = a.type && a.type in segmentOrder ? segmentOrder[a.type as SegmentType] : 99;
    const bOrder = b.type && b.type in segmentOrder ? segmentOrder[b.type as SegmentType] : 99;
    return aOrder - bOrder;
  });
}

export function defaultRoleForSegment(segmentType: SegmentType, preferredRole: AssignmentDraft["role"] = "technician"): AssignmentDraft["role"] {
  if (segmentType === "montaje") return "assembler";
  if (segmentType === "desmontaje") return "pickup_teardown";
  if (segmentType === "prueba") return "technician";
  return preferredRole;
}

const preferredPeople: Record<string, { priority: number; role: AssignmentDraft["role"] }> = {
  nahuel: { priority: 1, role: "technician" },
  dani: { priority: 2, role: "technician" },
  alex: { priority: 3, role: "driver" },
  "david sancho": { priority: 4, role: "assembler" },
  xavi: { priority: 5, role: "pickup_teardown" }
};

export function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function toLocalDateInput(value: string | Date) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function toLocalTimeInput(value: string | Date | null | undefined, fallback = "00:00") {
  if (!value) return fallback;
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(11, 16);
}

export function nextDateInput(date: string) {
  return toDateInput(addDays(new Date(`${date}T12:00:00`), 1));
}

export function timeLabel(value: string | Date) {
  return new Date(value).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function dateLabel(value: string | Date) {
  return new Date(value).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
}

export function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function makeWindow(date: string, start: string, end: string) {
  const startsAt = new Date(`${date}T${start || "00:00"}`);
  const endsAt = new Date(`${date}T${end || "00:00"}`);
  if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);
  return { startsAt, endsAt };
}

export function segmentWindow(segment: ScheduleSegmentDraft) {
  return makeWindow(segment.date, segment.start, segment.end);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function roundUpDate(date: Date, stepMinutes: number) {
  const copy = new Date(date);
  const minutes = copy.getMinutes();
  const roundedMinutes = Math.ceil(minutes / stepMinutes) * stepMinutes;
  copy.setMinutes(roundedMinutes, 0, 0);
  if (roundedMinutes === 60) copy.setHours(copy.getHours() + 1, 0, 0, 0);
  return copy;
}

function sameLocalDay(a: Date, b: Date) {
  return toDateInput(a) === toDateInput(b);
}

function segmentFromWindow(type: SegmentType, enabled: boolean, startsAt: Date, endsAt: Date, notes = ""): ScheduleSegmentDraft {
  return {
    type,
    enabled,
    date: toDateInput(startsAt),
    start: toLocalTimeInput(startsAt),
    end: toLocalTimeInput(endsAt),
    notes
  };
}

function defaultBoloWindow(dateInput: string, referenceDate = new Date()) {
  const targetDate = new Date(`${dateInput}T09:00:00`);
  let startsAt = targetDate;
  let durationMinutes = 9 * 60; // Por defecto 9 horas, de 09:00 a 18:00

  if (sameLocalDay(targetDate, referenceDate)) {
    const earliestOpsStart = roundUpDate(referenceDate, 15);
    startsAt = earliestOpsStart;
    durationMinutes = 3 * 60; // 3 horas si es hoy como valor inicial

    const latestReasonableToday = new Date(`${dateInput}T23:30:00`);
    if (startsAt > latestReasonableToday) {
      const tomorrow = addDays(new Date(`${dateInput}T12:00:00`), 1);
      startsAt = new Date(`${toDateInput(tomorrow)}T09:00:00`);
      durationMinutes = 9 * 60;
    }
  }

  return { startsAt, endsAt: addMinutes(startsAt, durationMinutes) };
}

export function smartSegmentsForBolo(bolo: ScheduleSegmentDraft, referenceDate = new Date()): ScheduleSegmentDraft[] {
  const boloWindow = segmentWindow(bolo);
  const startsHour = boloWindow.startsAt.getHours();
  const montageMinutes = startsHour >= 18 ? 180 : startsHour >= 14 ? 150 : 120;
  const pruebaMinutes = startsHour >= 14 ? 60 : 45;
  const desmontajeMinutes = boloWindow.endsAt.getHours() >= 23 || boloWindow.endsAt.getHours() < 6 ? 90 : 120;

  let pruebaEnd = boloWindow.startsAt;
  let pruebaStart = addMinutes(pruebaEnd, -pruebaMinutes);
  let montajeEnd = pruebaStart;
  let montajeStart = addMinutes(montajeEnd, -montageMinutes);

  if (sameLocalDay(boloWindow.startsAt, referenceDate)) {
    const earliestOpsStart = roundUpDate(addMinutes(referenceDate, 30), 15);
    if (montajeStart < earliestOpsStart) {
      const minutesBeforeBolo = Math.floor((boloWindow.startsAt.getTime() - earliestOpsStart.getTime()) / 60000);
      montajeStart = earliestOpsStart;

      if (minutesBeforeBolo >= 90) {
        pruebaStart = addMinutes(boloWindow.startsAt, -60);
        pruebaEnd = boloWindow.startsAt;
        montajeEnd = pruebaStart;
      } else if (minutesBeforeBolo >= 30) {
        montajeEnd = boloWindow.startsAt;
        pruebaStart = earliestOpsStart;
        pruebaEnd = boloWindow.startsAt;
      } else {
        montajeEnd = addMinutes(earliestOpsStart, 60);
        pruebaStart = earliestOpsStart;
        pruebaEnd = addMinutes(earliestOpsStart, 30);
      }
    }
  }

  const desmontajeStart = boloWindow.endsAt;
  const desmontajeEnd = addMinutes(desmontajeStart, desmontajeMinutes);

  return [
    { ...bolo },
    segmentFromWindow("montaje", false, montajeStart, montajeEnd),
    segmentFromWindow("prueba", false, pruebaStart, pruebaEnd),
    segmentFromWindow("desmontaje", false, desmontajeStart, desmontajeEnd)
  ];
}

export function normalizePersonName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function personPreference(user: any) {
  return preferredPeople[normalizePersonName(user.name)] ?? { priority: 99, role: "support" };
}

export function sortPeopleByOpsPreference(users: any[]) {
  return [...users].sort((a, b) => {
    const aPreference = personPreference(a);
    const bPreference = personPreference(b);
    if (aPreference.priority !== bPreference.priority) return aPreference.priority - bPreference.priority;
    return String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" });
  });
}

export function assignmentNames(event: any, segmentType?: string) {
  return (event.assignments ?? [])
    .filter((item: any) => {
      if (!segmentType) return true;
      const assignmentType = item.segment?.type ?? item.segmentType ?? "bolo";
      return assignmentType === segmentType;
    })
    .map((item: any) => item.user?.name ?? item.externalName ?? "Equipo")
    .join(", ");
}

export function defaultSegments(dateInput: string, referenceDate = new Date()): ScheduleSegmentDraft[] {
  const boloWindow = defaultBoloWindow(dateInput, referenceDate);
  const bolo = segmentFromWindow("bolo", true, boloWindow.startsAt, boloWindow.endsAt);
  return smartSegmentsForBolo(bolo, referenceDate);
}

export function enabledSegments(draft: QuickDraft) {
  return draft.segments.filter((segment) => segment.enabled);
}

export function activeSegment(draft: QuickDraft) {
  return draft.segments.find((segment) => segment.type === draft.activeSegmentType && segment.enabled)
    ?? draft.segments.find((segment) => segment.type === "bolo")
    ?? draft.segments[0];
}

export function defaultDraft(date = new Date()): QuickDraft {
  const dateInput = toDateInput(date);
  const segments = defaultSegments(dateInput);
  const bolo = segments.find((segment) => segment.type === "bolo") ?? segments[0]!;
  return {
    date: bolo.date,
    start: bolo.start,
    end: bolo.end,
    venueName: "",
    city: "Barcelona",
    venueAddress: "",
    segments,
    activeSegmentType: "bolo",
    assignments: [],
    hotelName: "",
    gearNotes: "",
    visibleNotes: "",
    internalNotes: "",
    tags: ""
  };
}

export function hasDraftData(draft: QuickDraft) {
  return Boolean(
    draft.venueName.trim() ||
    draft.venueAddress.trim() ||
    draft.assignments.length ||
    draft.hotelName.trim() ||
    draft.gearNotes.trim() ||
    draft.visibleNotes.trim() ||
    draft.internalNotes.trim() ||
    draft.tags.trim()
  );
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}
