import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/notifications", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    return prisma.notification.findMany({ where: { tenantId: request.user.tenantId, userId: request.user.id }, orderBy: { createdAt: "desc" }, take: 80 });
  });

  app.post("/notifications/:id/read", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const { id } = request.params as { id: string };
    return prisma.notification.updateMany({ where: { id, userId: request.user.id }, data: { readAt: new Date() } });
  });
}
