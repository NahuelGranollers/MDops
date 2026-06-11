"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getAccessToken } from "@/lib/api";

type PlanningEvent = {
  id: string;
  title: string;
  venueName: string;
  city: string;
  status: string;
  startsAt: string;
  endsAt: string;
  tags: string[];
  team: { id?: string; name: string; profileColor: string; role: string }[];
};

type DayGroup = {
  date: string;
  dayName: string;
  weekType: "current" | "next";
  events: PlanningEvent[];
};

const dayLabels = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const monthLabels = ["", "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const statusLabels: Record<string, string> = { pending: "Pte", confirmed: "Conf", completed: "Ok" };

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { day: d!, month: m!, year: y! };
}

export default function PlanningPage() {
  const [days, setDays] = useState<DayGroup[]>([]);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  const doFetch = useCallback(async () => {
    try {
      const data = await api<{ days: DayGroup[] }>("/events/weekly-planning");
      setDays(data.days);
      setError("");
    } catch {
      setError("Error cargando planing");
    }
  }, []);

  useEffect(() => {
    const t = getAccessToken();
    if (!t) return;
    setToken(t);
    setLoggedIn(true);
    doFetch();
    const interval = setInterval(doFetch, 60_000);
    return () => clearInterval(interval);
  }, [doFetch]);

  if (!loggedIn) {
    return (
      <div className="planning-root">
        <div className="planning-loading">Cargando...</div>
      </div>
    );
  }

  if (error && days.length === 0) {
    return (
      <div className="planning-root">
        <div className="planning-loading">{error}</div>
      </div>
    );
  }

  return (
    <div className="planning-root">
      <header className="planning-header">
        <h1>PISARRA MD</h1>
        <span className="planning-legend">
          <span className="legend-dot current" />Aquesta setmana
          <span className="legend-dot next" />Setmana vinent
        </span>
      </header>
      <div className="planning-grid">
        {days.map((day) => {
          const { day: d, month: m } = parseDate(day.date);
          const today = new Date();
          const todayStr = today.toISOString().slice(0, 10);
          const isToday = day.date === todayStr;
          return (
            <div key={day.date} className={`planning-day ${day.weekType} ${isToday ? "today" : ""}`}>
              <div className="planning-day-head">
                <span className="planning-day-month">{monthLabels[m]}</span>
                <span className="planning-day-num">{d}</span>
                <span className="planning-day-name">{dayLabels[["dom", "lun", "mar", "mié", "jue", "vie", "sáb"].indexOf(day.dayName)] ?? day.dayName}</span>
              </div>
              <div className="planning-events">
                {day.events.length === 0 && <div className="planning-empty">—</div>}
                {day.events.map((event) => (
                  <div key={event.id} className="planning-event">
                    <div className="planning-event-time">
                      {formatTime(event.startsAt)}
                    </div>
                    <div className="planning-event-body">
                      <div className="planning-event-title">
                        {event.venueName}
                        {event.city && <span className="planning-event-city">, {event.city}</span>}
                      </div>
                      <div className="planning-event-team">
                        {event.team.map((member, i) => (
                          <span key={i} className="planning-team-chip" style={{ borderLeftColor: member.profileColor }}>
                            {member.name.split(" ")[0]}
                          </span>
                        ))}
                      </div>
                      <div className="planning-event-meta">
                        <span className={`planning-status ${event.status}`}>{statusLabels[event.status] ?? event.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
