import { describe, expect, it } from "vitest";
import { allowsSameEventAssignmentOverlap, windowsOverlap } from "../events/assignment-overlaps.js";

const windowBase = {
  userId: "u1",
  startsAt: new Date("2026-06-01T20:00:00Z"),
  endsAt: new Date("2026-06-01T23:00:00Z")
};

describe("assignment overlap rules", () => {
  it("permite pruebas dentro del horario del bolo del mismo evento", () => {
    expect(allowsSameEventAssignmentOverlap(
      { ...windowBase, segmentType: "bolo" },
      { ...windowBase, segmentType: "prueba", startsAt: new Date("2026-06-01T21:00:00Z"), endsAt: new Date("2026-06-01T21:30:00Z") }
    )).toBe(true);
  });

  it("permite otros solapes internos de tramos del mismo bolo", () => {
    expect(allowsSameEventAssignmentOverlap(
      { ...windowBase, segmentType: "bolo" },
      { ...windowBase, segmentType: "montaje", startsAt: new Date("2026-06-01T21:00:00Z"), endsAt: new Date("2026-06-01T22:00:00Z") }
    )).toBe(true);
  });

  it("no considera solape cuando un tramo termina justo al empezar el siguiente", () => {
    expect(windowsOverlap(
      new Date("2026-06-01T18:00:00Z"),
      new Date("2026-06-01T20:00:00Z"),
      new Date("2026-06-01T20:00:00Z"),
      new Date("2026-06-01T22:00:00Z")
    )).toBe(false);
  });
});
