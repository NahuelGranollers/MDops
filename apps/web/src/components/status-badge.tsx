"use client";

import type { ReactNode } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  completed: "Completado",
  cancelled: "Cancelado",
  approved: "Aprobada",
  rejected: "Rechazada",
  pending_read: "Pendiente de leer",
  read: "Leído",
  assignment: "Asignación",
  availability: "Indisponibilidad",
  conflict: "Conflicto",
  logistics: "Logística",
  system: "Sistema",
  user: "Usuario",
  admin: "Admin"
};

const statusTones: Record<string, StatusTone> = {
  pending: "warning",
  confirmed: "success",
  completed: "success",
  approved: "success",
  rejected: "danger",
  cancelled: "danger",
  conflict: "danger",
  pending_read: "warning",
  read: "success",
  assignment: "info",
  availability: "info",
  logistics: "info"
};

export function statusLabel(value: string | null | undefined) {
  if (!value) return "Sin estado";
  return statusLabels[value] ?? value;
}

export function StatusBadge({ value, children, tone }: { value?: string | null; children?: ReactNode; tone?: StatusTone }) {
  const resolvedTone = tone ?? (value ? statusTones[value] : "neutral") ?? "neutral";
  return <span className={`badge tone-${resolvedTone}`}>{children ?? statusLabel(value)}</span>;
}
