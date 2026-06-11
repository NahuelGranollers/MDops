import type { FastifyInstance } from "fastify";
import type { User } from "@prisma/client";
import { availabilityRequestSchema, availabilityResolutionSchema } from "@md-ops/shared";
import { prisma } from "../db.js";
import { permissions, requirePermission, isAdmin } from "../auth/rbac.js";
import { audit } from "../audit/service.js";
import { publish } from "../realtime/bus.js";
import { createNotification, createNotifications } from "../notifications/email-service.js";

export async function availabilityRoutes(app: FastifyInstance) {
  app.get("/availability", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const where = isAdmin(request.user)
      ? { tenantId: request.user.tenantId, status: { not: "cancelled" as const } }
      : { tenantId: request.user.tenantId, userId: request.user.id, status: { not: "cancelled" as const } };
    return prisma.availabilityRequest.findMany({ where, include: { user: { select: { id: true, name: true } }, history: true }, orderBy: { startsAt: "asc" } });
  });

  async function notifyAdmins(tenantId: string, title: string, body: string, entityId?: string) {
    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        roles: { some: { role: { key: "admin" } } }
      }
    });
    if (admins.length > 0) {
      await createNotifications(admins.map((admin: User) => ({ tenantId, userId: admin.id, type: "availability_resolution", title, body, entityId })));
      publish({ tenantId, topic: "notifications", payload: { action: "created", multi: true } });
    }
  }

  app.post("/availability", { preHandler: requirePermission(permissions.availabilityOwn) }, async (request, reply) => {
    const input = availabilityRequestSchema.parse(request.body);
    const item = await prisma.availabilityRequest.create({
      data: { tenantId: request.user!.tenantId, userId: request.user!.id, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), reason: input.reason }
    });
    await prisma.availabilityStatusHistory.create({ data: { availabilityRequestId: item.id, toStatus: "pending", actorId: request.user!.id } });
    await audit(request.user, "create", "availability", item.id, undefined, item);
    await notifyAdmins(request.user!.tenantId, "Nueva indisponibilidad", `${request.user!.name} ha marcado que no está disponible del ${new Date(input.startsAt).toLocaleDateString()} al ${new Date(input.endsAt).toLocaleDateString()}.`, item.id);
    publish({ tenantId: request.user!.tenantId, topic: "availability", payload: { action: "created", id: item.id } });
    return reply.code(201).send(item);
  });

  app.put("/availability/:id", { preHandler: requirePermission(permissions.availabilityOwn) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await prisma.availabilityRequest.findFirst({ where: { id, userId: request.user!.id } });
    if (!before) return reply.notFound("No se ha encontrado la solicitud o no tienes permiso.");
    const input = availabilityRequestSchema.parse(request.body);
    const item = await prisma.availabilityRequest.update({
      where: { id },
      data: { startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), reason: input.reason }
    });
    await audit(request.user, "update", "availability", id, before, item);
    await notifyAdmins(request.user!.tenantId, "Indisponibilidad modificada", `${request.user!.name} ha actualizado su solicitud del ${new Date(item.startsAt).toLocaleDateString()}.`, id);
    publish({ tenantId: request.user!.tenantId, topic: "availability", payload: { action: "updated", id } });
    return item;
  });

  app.post("/availability/:id/cancel", { preHandler: requirePermission(permissions.availabilityOwn) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await prisma.availabilityRequest.findFirst({ where: { id, userId: request.user!.id } });
    if (!before) return reply.notFound();
    const item = await prisma.availabilityRequest.update({ where: { id }, data: { status: "cancelled" } });
    await prisma.availabilityStatusHistory.create({ data: { availabilityRequestId: id, fromStatus: before.status, toStatus: "cancelled", actorId: request.user!.id } });
    await audit(request.user, "cancel", "availability", id, before, item);
    await notifyAdmins(request.user!.tenantId, "Indisponibilidad cancelada", `${request.user!.name} ha cancelado su indisponibilidad para el ${new Date(before.startsAt).toLocaleDateString()}.`, id);
    publish({ tenantId: request.user!.tenantId, topic: "availability", payload: { action: "cancelled", id } });
    return item;
  });

  app.post("/availability/:id/resolve", { preHandler: requirePermission(permissions.availabilityManage) }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = availabilityResolutionSchema.parse(request.body);
    const before = await prisma.availabilityRequest.findFirst({ where: { id, tenantId: request.user!.tenantId } });
    if (!before) return reply.notFound();
    const item = await prisma.availabilityRequest.update({
      where: { id },
      data: { status: input.status, resolutionComment: input.resolutionComment, resolvedById: request.user!.id, resolvedAt: new Date() }
    });
    await prisma.availabilityStatusHistory.create({
      data: { availabilityRequestId: id, fromStatus: before.status, toStatus: input.status, comment: input.resolutionComment, actorId: request.user!.id }
    });
    await createNotification({
      tenantId: request.user!.tenantId,
      userId: before.userId,
      type: "availability_resolution",
      title: input.status === "approved" ? "Indisponibilidad aprobada" : "Indisponibilidad rechazada",
      body: input.resolutionComment ?? "Solicitud revisada.",
      entityId: id
    });
    await audit(request.user, input.status === "approved" ? "approve" : "reject", "availability", id, before, item);
    publish({ tenantId: request.user!.tenantId, topic: "availability", payload: { action: "resolved", id } });
    publish({ tenantId: request.user!.tenantId, topic: "notifications", payload: { action: "created", userId: before.userId } });
    return item;
  });
}
