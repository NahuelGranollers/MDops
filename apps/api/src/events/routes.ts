import type { FastifyInstance } from "fastify";
import type { Prisma, EventScheduleSegment, EventAssignment } from "@prisma/client";
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

export async function eventRoutes(app: FastifyInstance) {
  app.get("/events", async (request) => {
    const tenantId = request.user!.tenantId;
    const isAdminUser = isAdmin(request.user!);
    const where: any = { tenantId, deletedAt: null };
    if (!isAdminUser) {
      where.assignments = { some: { userId: request.user!.id } };
    }
    return prisma.event.findMany({
      where,
      include: {
        logistics: true,
        segments: { orderBy: { startsAt: "asc" } },
        assignments: {
          where: {
            OR: [
              { userId: null },
              { user: { email: { not: "pissarra@md.local" } } }
            ]
          },
          include: { user: { select: { id: true, name: true, profileColor: true } }, segment: true },
          orderBy: { createdAt: "asc" }
        },
        comments: { orderBy: { createdAt: "asc" }, take: 3 },
        attachments: { select: { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true } }
      },
      orderBy: { startsAt: "asc" }
    });
  });

  app.post("/events", async (request, reply) => {
    const input = eventSchema.parse(request.body);
    const tenantId = request.user!.tenantId;
    const segments = normalizeSegments(input);
    const policy = await getRestPolicy(tenantId);
    const candidates = candidateAssignmentWindows(input, segments);
    const placeholderId = "new";
    const windows: AssignmentWindow[] = candidates.map((c: any) => ({ eventId: placeholderId, title: input.title, userId: c.userId, startsAt: c.startsAt, endsAt: c.endsAt }));
    const restConflicts = detectRestConflicts(windows, policy.minRestHours);
    if (restConflicts.length > 0 && policy.restConflictMode === "block" && !input.forceConflicts) {
      return reply.code(409).send({ message: "No se cumple el descanso mínimo entre eventos.", conflicts: restConflicts });
    }
    const overlapConflicts = await assignmentOverlapConflicts(tenantId, input, segments);
    const event = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.event.create({
        data: {
          tenantId,
          title: input.title,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          city: input.city,
          venueName: input.venueName,
          venueAddress: input.venueAddress ?? null,
          venuePlaceId: input.venuePlaceId ?? null,
          hotelName: input.hotelName ?? null,
          hotelAddress: input.hotelAddress ?? null,
          hotelPlaceId: input.hotelPlaceId ?? null,
          status: input.status,
          visibleNotes: input.visibleNotes ?? null,
          internalNotes: input.internalNotes ?? null,
          gearNotes: input.gearNotes ?? null,
          tags: input.tags ?? [],
          createdById: request.user!.id,
          segments: { create: segments.map((s: any) => ({ type: s.type, startsAt: s.startsAt, endsAt: s.endsAt, notes: s.notes })) },
          logistics: input.logistics ? {
            create: {
              departureAt: input.logistics.departureAt ? new Date(input.logistics.departureAt) : null,
              arrivalAt: input.logistics.arrivalAt ? new Date(input.logistics.arrivalAt) : null,
              returnAt: input.logistics.returnAt ? new Date(input.logistics.returnAt) : null,
              contactName: input.logistics.contactName ?? null,
              contactPhone: input.logistics.contactPhone ?? null,
              venuePhone: input.logistics.venuePhone ?? null,
              budgetCents: input.logistics.budgetCents ?? null
            }
          } : undefined
        }
      });
      const segmentIds = new Map<string, string>();
      const allSegments = await tx.eventScheduleSegment.findMany({ where: { eventId: created.id } });
      for (const seg of allSegments) segmentIds.set(seg.type, seg.id);
      const assignments = assignmentData(input.assignments, segmentIds);
      if (assignments.length > 0) {
        await tx.eventAssignment.createMany({ data: assignments.map((a: any) => ({ ...a, eventId: created.id })) });
      }
      await saveRecurringFreelancers(tx, tenantId, input.assignments);
      return created;
    });
    if (restConflicts.length > 0 || overlapConflicts.length > 0) {
      const allConflicts = [...restConflicts, ...overlapConflicts];
      const eventName = `${event.venueName || event.title} (${event.city})`;
      await createNotifications(
        allConflicts.map((c: any) => ({
          tenantId,
          userId: c.userId,
          type: "conflict" as any,
          title: "Conflicto detectado",
          body: `Conflicto en ${eventName}`,
          entityId: event.id
        }))
      );
    }
    await audit(request.user, "create", "event", event.id, undefined, event);
    publish({ tenantId, topic: "events", payload: { action: "created", id: event.id } });
    return reply.code(201).send({ event, conflicts: [...restConflicts, ...overlapConflicts] });
  });

  app.put("/events/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = eventSchema.parse(request.body);
    const tenantId = request.user!.tenantId;
    const before = await prisma.event.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!before) return reply.notFound("Evento no encontrado.");
    const segments = normalizeSegments(input);
    const policy = await getRestPolicy(tenantId);
    const candidates = candidateAssignmentWindows(input, segments);
    const windows: AssignmentWindow[] = candidates.map((c: any) => ({ eventId: id, title: input.title, userId: c.userId, startsAt: c.startsAt, endsAt: c.endsAt }));
    const restConflicts = detectRestConflicts(windows, policy.minRestHours);
    if (restConflicts.length > 0 && policy.restConflictMode === "block" && !input.forceConflicts) {
      return reply.code(409).send({ message: "No se cumple el descanso mínimo entre eventos.", conflicts: restConflicts });
    }
    const overlapConflicts = await assignmentOverlapConflicts(tenantId, input, segments, id);
    const event = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.event.update({ where: { id }, data: { deletedAt: new Date() } });
      const updated = await tx.event.create({
        data: {
          tenantId,
          title: input.title,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          city: input.city,
          venueName: input.venueName,
          venueAddress: input.venueAddress ?? null,
          venuePlaceId: input.venuePlaceId ?? null,
          hotelName: input.hotelName ?? null,
          hotelAddress: input.hotelAddress ?? null,
          hotelPlaceId: input.hotelPlaceId ?? null,
          status: input.status,
          visibleNotes: input.visibleNotes ?? null,
          internalNotes: input.internalNotes ?? null,
          gearNotes: input.gearNotes ?? null,
          tags: input.tags ?? [],
          createdById: request.user!.id,
          segments: { create: segments.map((s: any) => ({ type: s.type, startsAt: s.startsAt, endsAt: s.endsAt, notes: s.notes })) },
          logistics: input.logistics ? {
            create: {
              departureAt: input.logistics.departureAt ? new Date(input.logistics.departureAt) : null,
              arrivalAt: input.logistics.arrivalAt ? new Date(input.logistics.arrivalAt) : null,
              returnAt: input.logistics.returnAt ? new Date(input.logistics.returnAt) : null,
              contactName: input.logistics.contactName ?? null,
              contactPhone: input.logistics.contactPhone ?? null,
              venuePhone: input.logistics.venuePhone ?? null,
              budgetCents: input.logistics.budgetCents ?? null
            }
          } : undefined
        }
      });
      const segmentIds = new Map<string, string>();
      const allSegments = await tx.eventScheduleSegment.findMany({ where: { eventId: updated.id } });
      for (const seg of allSegments) segmentIds.set(seg.type, seg.id);
      const assignments = assignmentData(input.assignments, segmentIds);
      if (assignments.length > 0) {
        await tx.eventAssignment.createMany({ data: assignments.map((a: any) => ({ ...a, eventId: updated.id })) });
      }
      await saveRecurringFreelancers(tx, tenantId, input.assignments);
      return { ...(await tx.event.findUnique({
        where: { id: updated.id },
        include: { logistics: true, segments: true, assignments: true }
      })) };
    });
    await audit(request.user, "update", "event", id, before, event);
    publish({ tenantId, topic: "events", payload: { action: "updated", id } });
    return { event, conflicts: [...restConflicts, ...overlapConflicts] };
  });

  app.post("/events/:id/duplicate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user!.tenantId;
    const original = await prisma.event.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { segments: true, assignments: true, logistics: true }
    });
    if (!original) return reply.notFound("Evento no encontrado.");
    const duplicated = await prisma.event.create({
      data: {
        tenantId,
        title: `${original.title} (copia)`,
        startsAt: original.startsAt,
        endsAt: original.endsAt,
        city: original.city,
        venueName: original.venueName,
        venueAddress: original.venueAddress,
        venuePlaceId: original.venuePlaceId,
        hotelName: original.hotelName,
        hotelAddress: original.hotelAddress,
        hotelPlaceId: original.hotelPlaceId,
        status: "pending",
        visibleNotes: original.visibleNotes,
        internalNotes: original.internalNotes,
        gearNotes: original.gearNotes,
        tags: original.tags,
        createdById: request.user!.id,
        segments: { create: original.segments.map((s: EventScheduleSegment) => ({ type: s.type, startsAt: s.startsAt, endsAt: s.endsAt, notes: s.notes })) },
        logistics: original.logistics ? {
          create: {
            departureAt: original.logistics.departureAt,
            arrivalAt: original.logistics.arrivalAt,
            returnAt: original.logistics.returnAt,
            contactName: original.logistics.contactName,
            contactPhone: original.logistics.contactPhone,
            venuePhone: original.logistics.venuePhone,
            budgetCents: original.logistics.budgetCents
          }
        } : undefined,
        assignments: { create: original.assignments.map((a: EventAssignment) => ({ userId: a.userId, externalName: a.externalName, externalPhone: a.externalPhone, role: a.role, personalNotes: a.personalNotes, departureAt: a.departureAt, arrivalAt: a.arrivalAt, logisticsNotes: a.logisticsNotes })) }
      }
    });
    await audit(request.user, "create", "event", duplicated.id, undefined, duplicated);
    publish({ tenantId, topic: "events", payload: { action: "created", id: duplicated.id } });
    return reply.code(201).send(duplicated);
  });

  app.get("/events/weekly-planning", async (request) => {
    const tenantId = request.user!.tenantId;
    const now = new Date();
    const fmtDay = new Intl.DateTimeFormat("es", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
    const parts = fmtDay.formatToParts(now);
    const todayStr = `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
    const today = new Date(todayStr + "T00:00:00+02:00");
    const [year, month, day] = todayStr.split("-").map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(Date.UTC(year, month - 1, day - daysToMonday));
    const sunday = new Date(Date.UTC(year, month - 1, day - daysToMonday + 6));
    const nextSunday = new Date(Date.UTC(year, month - 1, day - daysToMonday + 13));

    const events = await prisma.event.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { not: "cancelled" },
        startsAt: { gte: monday, lte: nextSunday }
      },
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true, profileColor: true } } },
          orderBy: { createdAt: "asc" }
        },
        segments: { orderBy: { startsAt: "asc" } }
      },
      orderBy: { startsAt: "asc" }
    });

    const dayNames = ["diumenge", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte"];
    const groups: Array<{ date: string; dayName: string; weekType: "current" | "next"; events: any[] }> = [];
    const cursor = new Date(monday);
    while (cursor <= sunday) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const dayName = dayNames[cursor.getUTCDay()]!;
      const isPast = cursor < today;
      const effectiveDate = new Date(isPast ? cursor.getTime() + 7 * 86400000 : cursor);
      const weekType = isPast ? "next" : "current";
      const effectiveDateStr = effectiveDate.toISOString().slice(0, 10);
      const dayEvents = events.filter((event) => {
        const eDate = new Date(event.startsAt);
        const eParts = fmtDay.formatToParts(eDate);
        const eStr = `${eParts.find((p) => p.type === "year")!.value}-${eParts.find((p) => p.type === "month")!.value}-${eParts.find((p) => p.type === "day")!.value}`;
        return eStr === effectiveDateStr;
      });
      groups.push({
        date: dateStr,
        dayName,
        weekType,
        events: dayEvents.map((event) => ({
          id: event.id,
          title: event.title,
          venueName: event.venueName,
          city: event.city,
          status: event.status,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          tags: event.tags,
          segments: event.segments,
          team: event.assignments.map((a) => ({
            id: a.user?.id,
            name: a.user?.name ?? a.externalName ?? "Freelance",
            profileColor: a.user?.profileColor ?? "#888",
            role: a.role
          }))
        }))
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { days: groups };
  });

  app.delete("/events/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user!.tenantId;
    const before = await prisma.event.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!before) return reply.notFound("Evento no encontrado.");
    const event = await prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(request.user, "cancel", "event", id, before, event);
    publish({ tenantId, topic: "events", payload: { action: "deleted", id } });
    return { ok: true };
  });

  app.post("/events/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = request.user!.tenantId;
    const event = await prisma.event.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!event) return reply.notFound("Evento no encontrado.");
    const file = await request.file();
    if (!file) return reply.badRequest("Falta el archivo.");
    const kind = (request.query as any)?.kind || null;
    const uploadDir = path.resolve(env.UPLOAD_DIR, "attachments");
    await mkdir(uploadDir, { recursive: true });
    const ext = path.extname(file.filename) || ".bin";
    const filename = `${nanoid(16)}${ext}`;
    const storagePath = path.join(uploadDir, filename);
    await pipeline(file.file, createWriteStream(storagePath));
    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        eventId: id,
        uploadedById: request.user!.id,
        filename: file.filename,
        kind,
        mimeType: file.mimetype,
        sizeBytes: (await stat(storagePath)).size,
        storagePath: `/uploads/attachments/${filename}`
      }
    });
    publish({ tenantId, topic: "events", payload: { action: "attachment_added", id } });
    return reply.code(201).send(attachment);
  });
}
