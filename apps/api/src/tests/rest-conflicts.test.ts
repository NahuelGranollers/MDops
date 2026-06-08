import { describe, expect, it } from "vitest";
import { detectRestConflicts } from "../events/rest-conflicts.js";

describe("detectRestConflicts", () => {
  it("detecta descanso inferior a 10 horas aunque cambie de dia", () => {
    const conflicts = detectRestConflicts([
      { eventId: "a", title: "Noche", userId: "u1", startsAt: new Date("2026-06-01T20:00:00Z"), endsAt: new Date("2026-06-02T02:00:00Z") },
      { eventId: "b", title: "Manana", userId: "u1", startsAt: new Date("2026-06-02T09:00:00Z"), endsAt: new Date("2026-06-02T12:00:00Z") }
    ], 10);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.restMinutes).toBe(420);
  });

  it("no mezcla usuarios diferentes", () => {
    const conflicts = detectRestConflicts([
      { eventId: "a", title: "A", userId: "u1", startsAt: new Date("2026-06-01T20:00:00Z"), endsAt: new Date("2026-06-02T02:00:00Z") },
      { eventId: "b", title: "B", userId: "u2", startsAt: new Date("2026-06-02T04:00:00Z"), endsAt: new Date("2026-06-02T08:00:00Z") }
    ], 10);
    expect(conflicts).toHaveLength(0);
  });

  it("no marca tramos del mismo bolo como falta de descanso", () => {
    const conflicts = detectRestConflicts([
      { eventId: "a", title: "Bolo", userId: "u1", startsAt: new Date("2026-06-01T16:00:00Z"), endsAt: new Date("2026-06-01T18:00:00Z") },
      { eventId: "a", title: "Bolo", userId: "u1", startsAt: new Date("2026-06-01T19:00:00Z"), endsAt: new Date("2026-06-01T23:00:00Z") }
    ], 10);
    expect(conflicts).toHaveLength(0);
  });
});
