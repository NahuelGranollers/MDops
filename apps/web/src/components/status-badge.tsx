"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@/lib/i18n/context";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

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

const statusKeys: Record<string, string> = {
  pending: "statusBadge.pending",
  confirmed: "statusBadge.confirmed",
  completed: "statusBadge.completed",
  cancelled: "statusBadge.cancelled",
  approved: "statusBadge.approved",
  rejected: "statusBadge.rejected",
  pending_read: "statusBadge.pendingRead",
  read: "statusBadge.read",
  assignment: "statusBadge.assignment",
  availability: "statusBadge.availability",
  conflict: "statusBadge.conflict",
  logistics: "statusBadge.logistics",
  system: "statusBadge.system",
  user: "statusBadge.user",
  admin: "statusBadge.admin"
};

export function statusLabel(value: string | null | undefined) {
  if (!value) return "statusBadge.noStatus";
  return statusKeys[value] ?? value;
}

export function StatusBadge({ value, children, tone }: { value?: string | null; children?: ReactNode; tone?: StatusTone }) {
  const { t } = useTranslation();
  const resolvedTone = tone ?? (value ? statusTones[value] : "neutral") ?? "neutral";
  return <span className={`badge tone-${resolvedTone}`}>{children ?? (value ? t(statusKeys[value] ?? value) : t("statusBadge.noStatus"))}</span>;
}