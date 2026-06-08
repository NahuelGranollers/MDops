import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { permissions, requirePermission } from "../auth/rbac.js";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit", { preHandler: requirePermission(permissions.auditRead) }, async (request) => {
    return prisma.auditLog.findMany({
      where: { tenantId: request.user!.tenantId },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 150
    });
  });
}
