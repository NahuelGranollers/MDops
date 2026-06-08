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
  const values = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
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
  return assignments.filter((assignment) => {
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
  }).map((assignment) => ({
    userId: assignment.userId ?? null,
    externalName: assignment.externalName?.trim() || null,
    externalPhone: assignment.externalPhone?.trim() || null,
    role: assignment.role,
    segmentId: assignment.segmentType ? segmentIds.get(assignment.segmentType) ?? null : null,
    personalNotes: assignment.personalNotes,
    departureAt: assignment.departureAt ? new Date(assignment.departureAt) : null,
    arrivalAt: assignment.arrivalAt ? new Date(assignment.arrivalAt) : null,
    logisticsNotes: assignment.logisticsNotes
  }));
}

function normalizeSegments(input: { startsAt: string; endsAt: string; segments: SegmentInput[] }) {
  const source = input.segments.length ? input.segments : [{ type: "bolo", startsAt: input.startsAt, endsAt: input.endsAt, notes: null }];
  const seen = new Set<string>();
  return source.filter((segment) => {
    if (seen.has(segment.type)) return false;
    seen.add(segment.type);
    return true;
  }).map((segment) => ({
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
  const byType = new Map(segments.map((segment) => [segment.type, segment]));
  return input.assignments
    .filter((assignment) => Boolean(assignment.userId))
    .map((assignment, index) => {
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
  const userIds = Array.from(new Set(candidates.map((candidate) => candidate.userId)));
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
    where: { tenantId, id: { in: userIds } },
    select: { id: true, name: true }
  });
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const assignments = await prisma.eventAssignment.findMany({
    where: {
      userId: { in: userIds },
      eventId: ignoreEventId ? { not: ignoreEventId } : undefined,
      event: { tenantId, deletedAt: null, status: { not: "cancelled" } }
    },
    include: { user: { select: { name: true } }, segment: true, event: true }
  });
  const windows: AssignmentWindow[] = assignments.filter((assignment) => Boolean(assignment.userId)).map((assignment) => ({
    eventId: assignment.eventId,
    title: assignment.event.title,
    userId: assignment.userId!,
    userName: assignment.user?.name ?? userNames.get(assignment.userId!) ?? null,
    startsAt: assignment.segment?.startsAt ?? assignment.departureAt ?? assignment.event.startsAt,
    endsAt: assignment.segment?.endsAt ?? assignment.arrivalAt ?? assignment.event.endsAt
  }));
  if (candidate) {
    for (const window of candidate.windows) {
      windows.push({
        eventId: candidate.id,
        title: candidate.title,
        userId: window.userId,
        userName: userNames.get(window.userId) ?? null,
        startsAt: window.startsAt,
        endsAt: window.endsAt
      });
    }
  }
  return detectRestConflicts(windows, minRestHours).filter((conflict) => !candidate || conflict.eventAId === candidate.id || conflict.eventBId === candidate.id);
}

function materializeCandidateConflicts(conflicts: RestConflict[], eventId: string) {
  return conflicts.map((conflict) => ({
    ...conflict,
    eventAId: conflict.eventAId === "candidate" ? eventId : conflict.eventAId,
    eventBId: conflict.eventBId === "candidate" ? eventId : conflict.eventBId
  }));
}

async function recordRestConflicts(tenantId: string, eventId: string, conflicts: RestConflict[]) {
  await prisma.conflictLog.updateMany({
    where: {
      tenantId,
      resolvedAt: null,
      OR: [{ eventAId: eventId }, { eventBId: eventId }]
    },
    data: { resolvedAt: new Date() }
  });

  const storable = conflicts.filter((conflict) => conflict.eventAId !== conflict.eventBId && conflict.eventAId !== "candidate" && conflict.eventBId !== "candidate");
  if (!storable.length) return;

  await prisma.$transaction(async (tx) => {
    await tx.conflictLog.createMany({
      data: storable.map((conflict) => ({
        tenantId,
        userId: conflict.userId,
        eventAId: conflict.eventAId,
        eventBId: conflict.eventBId,
        restMinutes: conflict.restMinutes,
        requiredHours: Math.ceil(conflict.requiredMinutes / 60)
      }))
    });
  });

  await createNotifications(storable.map((conflict) => ({
    tenantId,
    userId: conflict.userId,
    type: "conflict",
    title: "Descanso mínimo incumplido",
    body: `${conflict.userName ?? "Una persona"} tiene ${Math.floor(conflict.restMinutes / 60)}h ${conflict.restMinutes % 60}min de descanso entre "${conflict.eventATitle}" y "${conflict.eventBTitle}".`,
    entityId: conflict.eventBId === eventId ? conflict.eventBId : conflict.eventAId
  })));
}

export async function eventRoutes(app: FastifyInstance) {
  app.get("/events", async (request) => {
    if (!request.user) throw app.httpErrors.unauthorized();
    const query = request.query as { from?: string; to?: string; status?: any; mine?: string };
    const ownOnly = query.mine === "true";
    const events = await prisma.event.findMany({
      where: {
        tenantId: request.user.tenantId,
        deletedAt: null,
        status: query.status ?? { not: "cancelled" },
        startsAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
        assignments: ownOnly ? { some: { userId: request.user.id } } : undefined
      },
      include: {
        logistics: true,
        segments: { orderBy: { startsAt: "asc" } },
        assignments: { include: { segment: true, user: { select: { id: true, name: true, email: true } } } },
        attachments: true,
        comments: isAdmin(request.user)
      },
      orderBy: { startsAt: "asc" }
    });
    if (isAdmin(request.user)) return events;
    return events.map((event) => ({ ...event, internalNotes: undefined, comments: [] }));
  });

  app.get("/events/:id", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const { id } = request.params as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, tenantId: request.user.tenantId, deletedAt: null },
      include: { logistics: true, segments: { orderBy: { startsAt: "asc" } }, assignments: { include: { segment: true, user: true } }, comments: true, attachments: true }
    });
    if (!event) return reply.notFound();
    if (!isAdmin(request.user)) {
      return {
        ...event,
        internalNotes: undefined,
        comments: event.comments.filter((comment) => !comment.internal),
        assignments: event.assignments.filter((assignment) => assignment.userId === request.user!.id)
      };
    }
    return event;
  });

  app.post("/events", { preHandler: requirePermission(permissions.eventsWrite) }, async (request, reply) => {
    const input = eventSchema.parse(request.body);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const segments = normalizeSegments(input);
    const restPolicy = await getRestPolicy(request.user!.tenantId);
    const overlapConflicts = await assignmentOverlapConflicts(request.user!.tenantId, input, segments);
    if (overlapConflicts.length) {
      return reply.code(409).send({ message: "Esa persona ya esta asignada en ese horario.", conflicts: overlapConflicts });
    }
    const candidateWindows = candidateAssignmentWindows(input, segments);
    const userIds = Array.from(new Set(candidateWindows.map((assignment) => assignment.userId)));
    const conflicts = await restConflictWindows(request.user!.tenantId, userIds, restPolicy.minRestHours, { id: "candidate", title: input.title, windows: candidateWindows });
    if (conflicts.length && restPolicy.restConflictMode === "block" && !input.forceConflicts) {
      return reply.code(409).send({ message: "Hay conflictos de descanso minimo.", conflicts });
    }
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          tenantId: request.user!.tenantId,
          title: input.title,
          startsAt,
          endsAt,
          city: input.city,
          venueName: input.venueName,
          venueAddress: input.venueAddress,
          venuePlaceId: input.venuePlaceId,
          hotelName: input.hotelName,
          hotelAddress: input.hotelAddress,
          hotelPlaceId: input.hotelPlaceId,
          status: input.status,
          visibleNotes: input.visibleNotes,
          internalNotes: input.internalNotes,
          gearNotes: input.gearNotes,
          tags: input.tags,
          createdById: request.user!.id,
          logistics: { create: input.logistics }
        }
      });
      const segmentIds = new Map<string, string>();
      for (const segment of segments) {
        const createdSegment = await tx.eventScheduleSegment.create({
          data: { eventId: created.id, type: segment.type, startsAt: segment.startsAt, endsAt: segment.endsAt, notes: segment.notes }
        });
        segmentIds.set(segment.type, createdSegment.id);
      }
      const assignments = assignmentData(input.assignments, segmentIds);
      if (assignments.length) {
        await tx.eventAssignment.createMany({
          data: assignments.map((assignment) => ({ ...assignment, eventId: created.id }))
        });
      }
      await saveRecurringFreelancers(tx, request.user!.tenantId, input.assignments);
      return tx.event.findUniqueOrThrow({
        where: { id: created.id },
        include: { logistics: true, segments: { orderBy: { startsAt: "asc" } }, assignments: { include: { segment: true, user: true } }, attachments: true }
      });
    });
    const recipients = await prisma.user.findMany({
      where: { tenantId: request.user!.tenantId, deletedAt: null, isActive: true },
      select: { id: true }
    });
    if (recipients.length) {
      await createNotifications(recipients.map((user) => ({
        tenantId: request.user!.tenantId,
        userId: user.id,
        type: "assignment",
        title: "Nuevo bolo",
        body: `${event.venueName || event.title} · ${event.city}`,
        entityId: event.id
      })));
    }
    const finalConflicts = materializeCandidateConflicts(conflicts, event.id);
    await recordRestConflicts(request.user!.tenantId, event.id, finalConflicts);
    await audit(request.user, "create", "event", event.id, undefined, event);
    publish({ tenantId: request.user!.tenantId, topic: "events", payload: { action: "created", id: event.id } });
    publish({ tenantId: request.user!.tenantId, topic: "notifications", payload: { action: "created", entity: "event", id: event.id } });
    if (finalConflicts.length) publish({ tenantId: request.user!.tenantId, topic: "notifications", payload: { action: "created", entity: "conflict", id: event.id } });
    return reply.code(201).send({ event, conflicts: finalConflicts });
  });

  app.put("/events/:id", { preHandler: requirePermission(permissions.eventsWrite) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await prisma.event.findFirst({ where: { id, tenantId: request.user!.tenantId, deletedAt: null }, include: { assignments: true, logistics: true, segments: true } });
    if (!before) return reply.notFound();
    const input = eventSchema.parse(request.body);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const segments = normalizeSegments(input);
    const restPolicy = await getRestPolicy(request.user!.tenantId);
    const overlapConflicts = await assignmentOverlapConflicts(request.user!.tenantId, input, segments, id);
    if (overlapConflicts.length) {
      return reply.code(409).send({ message: "Esa persona ya esta asignada en ese horario.", conflicts: overlapConflicts });
    }
    const candidateWindows = candidateAssignmentWindows(input, segments);
    const userIds = Array.from(new Set(candidateWindows.map((assignment) => assignment.userId)));
    const conflicts = await restConflictWindows(request.user!.tenantId, userIds, restPolicy.minRestHours, { id, title: input.title, windows: candidateWindows }, id);
    if (conflicts.length && restPolicy.restConflictMode === "block" && !input.forceConflicts) {
      return reply.code(409).send({ message: "Hay conflictos de descanso minimo.", conflicts });
    }
    const event = await prisma.$transaction(async (tx) => {
      await tx.eventAssignment.deleteMany({ where: { eventId: id } });
      await tx.eventScheduleSegment.deleteMany({ where: { eventId: id } });
      await tx.logistics.upsert({ where: { eventId: id }, create: { eventId: id, ...input.logistics }, update: input.logistics });
      const updated = await tx.event.update({
        where: { id },
        data: {
          title: input.title,
          startsAt,
          endsAt,
          city: input.city,
          venueName: input.venueName,
          venueAddress: input.venueAddress,
          venuePlaceId: input.venuePlaceId,
          hotelName: input.hotelName,
          hotelAddress: input.hotelAddress,
          hotelPlaceId: input.hotelPlaceId,
          status: input.status,
          visibleNotes: input.visibleNotes,
          internalNotes: input.internalNotes,
          gearNotes: input.gearNotes,
          tags: input.tags
        }
      });
      const segmentIds = new Map<string, string>();
      for (const segment of segments) {
        const createdSegment = await tx.eventScheduleSegment.create({
          data: { eventId: id, type: segment.type, startsAt: segment.startsAt, endsAt: segment.endsAt, notes: segment.notes }
        });
        segmentIds.set(segment.type, createdSegment.id);
      }
      const assignments = assignmentData(input.assignments, segmentIds);
      if (assignments.length) {
        await tx.eventAssignment.createMany({
          data: assignments.map((assignment) => ({ ...assignment, eventId: id }))
        });
      }
      await saveRecurringFreelancers(tx, request.user!.tenantId, input.assignments);
      const updatedFull = await tx.event.findUniqueOrThrow({
        where: { id },
        include: { assignments: { include: { segment: true, user: true } }, logistics: true, segments: { orderBy: { startsAt: "asc" } }, attachments: true }
      });
      return updatedFull;
    });
    const assignmentRecipientIds = Array.from(new Set(event.assignments.map((assignment) => assignment.userId).filter((userId): userId is string => Boolean(userId))));
    if (assignmentRecipientIds.length) {
      await createNotifications(assignmentRecipientIds.map((userId) => ({
        tenantId: request.user!.tenantId,
        userId,
        type: "assignment",
        title: "Bolo actualizado/asignado",
        body: event.venueName || event.title,
        entityId: event.id
      })));
    }
    await recordRestConflicts(request.user!.tenantId, id, conflicts);
    await audit(request.user, "update", "event", id, before, event);
    publish({ tenantId: request.user!.tenantId, topic: "events", payload: { action: "updated", id } });
    if (assignmentRecipientIds.length) publish({ tenantId: request.user!.tenantId, topic: "notifications", payload: { action: "created", entity: "event", id } });
    if (conflicts.length) publish({ tenantId: request.user!.tenantId, topic: "notifications", payload: { action: "created", entity: "conflict", id } });
    return { event, conflicts };
  });

  app.post("/events/:id/duplicate", { preHandler: requirePermission(permissions.eventsWrite) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const source = await prisma.event.findFirst({ where: { id, tenantId: request.user!.tenantId, deletedAt: null }, include: { logistics: true, segments: true, assignments: { include: { segment: true } } } });
    if (!source) return reply.notFound();
    const copy = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          tenantId: source.tenantId,
          title: `${source.title} (copia)`,
          startsAt: source.startsAt,
          endsAt: source.endsAt,
          city: source.city,
          venueName: source.venueName,
          venueAddress: source.venueAddress,
          status: "pending",
          visibleNotes: source.visibleNotes,
          internalNotes: source.internalNotes,
          gearNotes: source.gearNotes,
          tags: source.tags,
          createdById: request.user!.id,
          logistics: source.logistics ? { create: {
            departureAt: source.logistics.departureAt,
            arrivalAt: source.logistics.arrivalAt,
            returnAt: source.logistics.returnAt,
            contactName: source.logistics.contactName,
            contactPhone: source.logistics.contactPhone,
            venuePhone: source.logistics.venuePhone,
            budgetCents: source.logistics.budgetCents
          } } : undefined
        }
      });
      const segmentIds = new Map<string, string>();
      for (const segment of source.segments) {
        const createdSegment = await tx.eventScheduleSegment.create({
          data: { eventId: created.id, type: segment.type, startsAt: segment.startsAt, endsAt: segment.endsAt, notes: segment.notes }
        });
        segmentIds.set(segment.id, createdSegment.id);
      }
      const assignments = source.assignments.map((assignment) => ({
        eventId: created.id,
        userId: assignment.userId,
        externalName: assignment.externalName,
        externalPhone: assignment.externalPhone,
        role: assignment.role,
        segmentId: assignment.segmentId ? segmentIds.get(assignment.segmentId) ?? null : null,
        personalNotes: assignment.personalNotes,
        departureAt: assignment.departureAt,
        arrivalAt: assignment.arrivalAt,
        logisticsNotes: assignment.logisticsNotes
      }));
      if (assignments.length) await tx.eventAssignment.createMany({ data: assignments });
      return created;
    });
    await audit(request.user, "create", "event", copy.id, undefined, copy);
    publish({ tenantId: request.user!.tenantId, topic: "events", payload: { action: "duplicated", id: copy.id } });
    return reply.code(201).send(copy);
  });

  app.post("/events/:id/attachments", { preHandler: requirePermission(permissions.eventsWrite) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { kind } = request.query as { kind?: string };
    const event = await prisma.event.findFirst({ where: { id, tenantId: request.user!.tenantId, deletedAt: null } });
    if (!event) return reply.notFound();

    const file = await request.file();
    if (!file) return reply.badRequest("Falta el PDF.");
    if (file.mimetype !== "application/pdf" && !file.filename.toLowerCase().endsWith(".pdf")) {
      return reply.badRequest("Solo se admiten archivos PDF.");
    }

    const safeName = file.filename.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "documento.pdf";
    const storedName = `${Date.now()}-${nanoid(8)}-${safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`}`;
    
    let storagePath: string;
    let sizeBytes: number;

    if (supabase) {
      const buffer = await file.toBuffer();
      sizeBytes = buffer.length;
      const { error } = await supabase.storage.from("md-ops-uploads").upload(`events/${id}/${storedName}`, buffer, {
        contentType: file.mimetype,
        upsert: true
      });
      if (error) {
        request.log.error(error);
        return reply.internalServerError("No se pudo subir el archivo a Supabase.");
      }
      const { data: publicUrlData } = supabase.storage.from("md-ops-uploads").getPublicUrl(`events/${id}/${storedName}`);
      storagePath = publicUrlData.publicUrl;
    } else {
      const uploadDir = path.resolve(env.UPLOAD_DIR, "events", id);
      await mkdir(uploadDir, { recursive: true });
      const destination = path.join(uploadDir, storedName);
      await pipeline(file.file, createWriteStream(destination));
      sizeBytes = (await stat(destination)).size;
      storagePath = `/uploads/events/${id}/${storedName}`;
    }

    const attachment = await prisma.attachment.create({
      data: {
        tenantId: request.user!.tenantId,
        eventId: id,
        uploadedById: request.user!.id,
        filename: file.filename,
        kind: kind?.trim() || "albaran",
        mimeType: "application/pdf",
        sizeBytes,
        storagePath
      }
    });
    publish({ tenantId: request.user!.tenantId, topic: "events", payload: { action: "attachment", id } });
    return reply.code(201).send(attachment);
  });

  app.get("/freelancers", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    if (!isAdmin(request.user)) return [];
    return prisma.freelanceContact.findMany({
      where: { tenantId: request.user.tenantId },
      orderBy: { name: "asc" }
    });
  });

  app.post("/freelancers", { preHandler: requirePermission(permissions.eventsWrite) }, async (request, reply) => {
    const body = request.body as { name?: string; phone?: string | null; notes?: string | null };
    const name = body.name?.trim();
    if (!name) return reply.badRequest("Falta el nombre.");
    const phone = body.phone?.trim() || null;
    const existing = await prisma.freelanceContact.findFirst({ where: { tenantId: request.user!.tenantId, name, phone } });
    if (existing) return existing;
    const contact = await prisma.freelanceContact.create({
      data: { tenantId: request.user!.tenantId, name, phone, notes: body.notes?.trim() || null }
    });
    return reply.code(201).send(contact);
  });

  app.delete("/events/:id", { preHandler: requirePermission(permissions.eventsWrite) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await prisma.event.findFirst({
      where: { id, tenantId: request.user!.tenantId, deletedAt: null },
      include: { assignments: { select: { userId: true } } }
    });
    if (!event) return reply.notFound();
    const deleted = await prisma.event.update({ where: { id }, data: { deletedAt: new Date() } });
    const assignmentRecipientIds = Array.from(new Set(event.assignments.map((assignment) => assignment.userId).filter((userId): userId is string => Boolean(userId))));
    if (assignmentRecipientIds.length) {
      await createNotifications(assignmentRecipientIds.map((userId) => ({
        tenantId: request.user!.tenantId,
        userId,
        type: "cancellation",
        title: "Bolo cancelado",
        body: event.venueName || event.title,
        entityId: event.id
      })));
    }
    await audit(request.user, "delete", "event", id, event, { deletedAt: deleted.deletedAt });
    publish({ tenantId: request.user!.tenantId, topic: "events", payload: { action: "deleted", id } });
    if (assignmentRecipientIds.length) publish({ tenantId: request.user!.tenantId, topic: "notifications", payload: { action: "created", entity: "event", id } });
    return reply.code(204).send();
  });
}
