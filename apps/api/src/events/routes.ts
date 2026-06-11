import type { FastifyInstance } from "fastify";
import { mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { eventSchema } from "@md-ops/shared";
import { prisma } from "../db.js";
import { env } from "../config/env.js";
import { permissions, requirePermission, isAdmin } from "../auth/rbac.js";
import { audit } from "../audit/service.js";
import { publish } from "../realtime/bus.js";
import { allowsSameEventAssignmentOverlap, windowsOverlap } from "./assignment-overlaps.js";
import { detectRestConflicts, type AssignmentWindow, type RestConflict } from "./rest-conflicts.js";
import { createNotifications } from "../notifications/email-service.js";
import { supabase } from "../config/supabase.js";

type SegmentInput = { type: string; startsAt: string; endsAt: string; notes?: string | null };
type SegmentWindow = { type: string; startsAt: Date; endsAt: Date };
type RestPolicy = { minRestHours: number; restConflictMode: "warn" | "block" };

async function getRestPolicy(tenantId: string): Promise<RestPolicy> {
  const settings = await prisma.setting.findMany({
    where: { tenantId, key: { in: ["minRestHours", "restConflictMode"] } }
  });
  const values = Object.fromEntries(settings.map((setting: any) => [setting.key, setting.value]));
  const minRestHours = Number(values.minRestHours ?? env.MIN_REST_HOURS);
  const restConflictMode = values.restConflictMode === "block" ? "block" : values.restConflictMode === "warn" ? "warn" : env.REST_CONFLICT_MODE;
  return {
    minRestHours: Number.isFinite(minRestHours) ? minRestHours : env.MIN_REST_HOURS,
    restConflictMode
  };
}

function assignmentData(assignments: Array<{
  userId?: string | null;
  externalName?: string | null;
  externalPhone?: string | null;
  role: any;
  segmentType?: string | null;
  saveFreelance?: boolean | null;
  personalNotes?: string | null;
  departureAt?: string | null;
  arrivalAt?: string | null;
  logisticsNotes?: string | null;
}>, segmentIds = new Map<string, string>()) {
  const seen = new Set<string>();
  return assignments.filter((assignment: any) => {
    const key = [
      assignment.userId,
      assignment.externalName ?? "",
      assignment.externalPhone ?? "",
      assignment.role,
      assignment.segmentType ?? "",
      assignment.departureAt ?? "",
      assignment.arrivalAt ?? "",
      assignment.personalNotes ?? "",
      assignment.logisticsNotes ?? ""
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((assignment: any) => ({
    userId: assignment.userId ?? null,
    externalName: assignment.externalName?.trim() || null,
    externalPhone: assignment.externalPhone?.trim() || null,
    role: assignment.role,
    segmentId: assignment.segmentType ? segmentIds.get(assignment.segmentType) ?? null : null,
    personalNotes: assignment.personalNotes ?? null,
    departureAt: assignment.departureAt ? new Date(assignment.departureAt) : null,
    arrivalAt: assignment.arrivalAt ? new Date(assignment.arrivalAt) : null,
    logisticsNotes: assignment.logisticsNotes ?? null
  }));
}

function normalizeSegments(input: { startsAt: string; endsAt: string; segments: SegmentInput[] }) {
  const source = input.segments.length ? input.segments : [{ type: "bolo", startsAt: input.startsAt, endsAt: input.endsAt, notes: null }];
  const seen = new Set<string>();
  return source.filter((segment: any) => {
    if (seen.has(segment.type)) return false;
    seen.add(segment.type);
    return true;
  }).map((segment: any) => ({
    type: segment.type,
    startsAt: new Date(segment.startsAt),
    endsAt: new Date(segment.endsAt),
    notes: segment.notes?.trim() || null
  }));
}

function candidateAssignmentWindows(input: {
  startsAt: string;
  endsAt: string;
  assignments: Array<{ userId?: string | null; segmentType?: string | null; departureAt?: string | null; arrivalAt?: string | null }>;
}, segments: SegmentWindow[]) {
  const byType = new Map(segments.map((segment: any) => [segment.type, segment]));
  return input.assignments
    .filter((assignment: any) => Boolean(assignment.userId))
    .map((assignment: any, index: number) => {
      const segment = assignment.segmentType ? byType.get(assignment.segmentType) : undefined;
      const startsAt = segment?.startsAt ?? (assignment.departureAt ? new Date(assignment.departureAt) : new Date(input.startsAt));
      const endsAt = segment?.endsAt ?? (assignment.arrivalAt ? new Date(assignment.arrivalAt) : new Date(input.endsAt));
      return { index, userId: assignment.userId!, segmentType: assignment.segmentType ?? segment?.type ?? "bolo", startsAt, endsAt };
    });
}

async function assignmentOverlapConflicts(
  tenantId: string,
  input: {
    startsAt: string;
    endsAt: string;
    title: string;
    assignments: Array<{ userId?: string | null; segmentType?: string | null; departureAt?: string | null; arrivalAt?: string | null }>;
  },
  segments: SegmentWindow[],
  ignoreEventId?: string
) {
  const candidates = candidateAssignmentWindows(input, segments);
  const userIds = Array.from(new Set(candidates.map((candidate: any) => candidate.userId)));
  const conflicts: Array<{
    userId: string;
    userName?: string | null;
    title: string;
    segmentType?: string | null;
    startsAt: Date;
    endsAt: Date;
  }> = [];

  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = candidates[left]!;
      const b = candidates[right]!;
      if (a.userId === b.userId && windowsOverlap(a.startsAt, a.endsAt, b.startsAt, b.endsAt) && !allowsSameEventAssignmentOverlap(a, b)) {
        conflicts.push({ userId: a.userId, title: input.title, segmentType: b.segmentType, startsAt: b.startsAt, endsAt: b.endsAt });
      }
    }
  }

  if (!userIds.length) return conflicts;

  const existing = await prisma.eventAssignment.findMany({
    where: {
      userId: { in: userIds },
      eventId: ignoreEventId ? { not: ignoreEventId } : undefined,
      event: { tenantId, deletedAt: null, status: { not: "cancelled" } }
    },
    include: {
      user: { select: { name: true } },
      segment: true,
      event: { select: { id: true, title: true, venueName: true, startsAt: true, endsAt: true } }
    }
  });

  for (const candidate of candidates) {
    for (const assignment of existing) {
      if (assignment.userId !== candidate.userId) continue;
      const startsAt = assignment.segment?.startsAt ?? assignment.departureAt ?? assignment.event.startsAt;
      const endsAt = assignment.segment?.endsAt ?? assignment.arrivalAt ?? assignment.event.endsAt;
      if (!windowsOverlap(candidate.startsAt, candidate.endsAt, startsAt, endsAt)) continue;
      conflicts.push({
        userId: candidate.userId,
        userName: assignment.user?.name,
        title: assignment.event.venueName || assignment.event.title,
        segmentType: assignment.segment?.type,
        startsAt,
        endsAt
      });
    }
  }

  return conflicts;
}

async function saveRecurringFreelancers(tx: any, tenantId: string, assignments: Array<{
  externalName?: string | null;
  externalPhone?: string | null;
  saveFreelance?: boolean | null;
}>) {
  const seen = new Set<string>();
  for (const assignment of assignments) {
    const name = assignment.externalName?.trim();
    if (!name || !assignment.saveFreelance) continue;
    const phone = assignment.externalPhone?.trim() || null;
    const key = `${name.toLocaleLowerCase("es")}|${phone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await tx.freelanceContact.findFirst({ where: { tenantId, name, phone } });
    if (!existing) await tx.freelanceContact.create({ data: { tenantId, name, phone } });
  }
}

async function restConflictWindows(
  tenantId: string,
  userIds: string[],
  minRestHours: number,
  candidate?: { id: string; title: string; windows: Array<{ userId: string; startsAt: Date; endsAt: Date }> },
  ignoreEventId?: string
) {
  if (!userIds.length) return [];
  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: userIds } }
  });
  return users;
}
