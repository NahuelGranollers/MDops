"use client";

import { CalendarDays, Plus, UserRound } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { assignmentNames, dateLabel, segmentClassName, segmentLabels, sortSegmentsByOpsOrder, timeLabel, type ViewMode } from "@/components/agenda/agenda-utils";

export function AgendaSkeleton() {
  return (
    <div className="calendar-board">
      {Array.from({ length: 7 }, (_, index) => (
        <section className="day-column skeleton-column" key={index}>
          <div className="day-head skeleton-line" />
          <div className="day-events">
            <div className="event-block skeleton-card" />
            <div className="event-block skeleton-card short" />
          </div>
        </section>
      ))}
    </div>
  );
}

export function AdminCalendar({ mode, days, events, onCreate, onSelect }: { mode: ViewMode; days: Date[]; events: any[]; onCreate: (date?: Date) => void; onSelect: (event: any) => void }) {
  const { t } = useTranslation();
  if (mode === "list") {
    return <div className="agenda-list">{events.map((event) => <EventRow key={event.id} event={event} onClick={() => onSelect(event)} />)}{events.length === 0 && <EmptyAgenda onCreate={onCreate} />}</div>;
  }

  return (
    <div className={`calendar-board ${mode}`}>
      {days.map((day) => {
        const dayEvents = events.flatMap((event) => projectEventSegments(event)).filter((event) => new Date(event.startsAt).toDateString() === day.toDateString());
        return (
          <section className="day-column" key={day.toISOString()}>
            <button className="day-head" onClick={() => onCreate(day)}>
              <span>{dateLabel(day)}</span>
              <Plus size={15} />
            </button>
            <div className="day-events">
              {dayEvents.map((event) => <EventBlock key={event._calendarId ?? event.id} event={event} onClick={() => onSelect(event._parent ?? event)} />)}
              {dayEvents.length === 0 && <button className="empty-slot" onClick={() => onCreate(day)}>{t("agendaCalendar.emptySlot")}</button>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function UserAgenda({ events, onSelect }: { events: any[]; onSelect: (event: any) => void }) {
  const { t } = useTranslation();
  const rows = events.flatMap((event) => projectEventSegments(event));
  return (
    <div className="user-agenda">
      {rows.map((event) => <EventRow key={event._calendarId ?? event.id} event={event} userFocused onClick={() => onSelect(event._parent ?? event)} />)}
      {rows.length === 0 && <div className="empty-state"><CalendarDays size={30} /><strong>{t("agendaCalendar.noEventsInView")}</strong><span>{t("agendaCalendar.noEventsDesc")}</span></div>}
    </div>
  );
}

function EventBlock({ event, onClick }: { event: any; onClick: () => void }) {
  const people = assignmentNames(event, event._segment?.type);
  const phaseClass = segmentClassName(event._segment?.type);
  return (
    <button className={`event-block ${event.status} ${phaseClass}`} onClick={onClick}>
      <span className="event-time">{timeLabel(event.startsAt)}-{timeLabel(event.endsAt)}</span>
      {event._segment?.type && <span className={`phase-badge ${phaseClass}`}>{segmentLabels[event._segment.type as keyof typeof segmentLabels]}</span>}
      <strong>{event.venueName || event.title}</strong>
      <span>{event.city}</span>
      {people && <span className="people-line"><UserRound size={13} />{people}</span>}
    </button>
  );
}

function EventRow({ event, onClick, userFocused = false }: { event: any; onClick?: () => void; userFocused?: boolean }) {
  const phaseClass = segmentClassName(event._segment?.type);
  return (
    <button className={`event-row ${phaseClass}`} onClick={onClick}>
      <div className="date-pill"><strong>{new Date(event.startsAt).getDate()}</strong><span>{new Date(event.startsAt).toLocaleDateString("es-ES", { month: "short" })}</span></div>
      <div>
        <strong>{event.venueName || event.title}</strong>
        <div className="muted">{event._segment?.type ? `${segmentLabels[event._segment.type as keyof typeof segmentLabels]} - ` : ""}{timeLabel(event.startsAt)}-{timeLabel(event.endsAt)} - {event.city}</div>
        {userFocused && event.hotelName && <div className="row compact"><span className="badge">Hotel</span></div>}
      </div>
      <span className={`status-dot ${event.status}`} />
      <span className="people-summary">{assignmentNames(event, event._segment?.type)}</span>
    </button>
  );
}

function projectEventSegments(event: any) {
  if (!event.segments?.length) return [event];
  return sortSegmentsByOpsOrder(event.segments).map((segment: any) => ({
    ...event,
    startsAt: segment.startsAt,
    endsAt: segment.endsAt,
    _segment: segment,
    _parent: event,
    _calendarId: `${event.id}-${segment.id ?? segment.type}`
  }));
}

function EmptyAgenda({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <CalendarDays size={30} />
      <strong>{t("agendaCalendar.cleanWeek")}</strong>
      <span>{t("agendaCalendar.cleanWeekDesc")}</span>
      <button className="button" onClick={onCreate}><Plus size={17} />{t("agendaCalendar.newEvent")}</button>
    </div>
  );
}
