import type { FastifyInstance } from "fastify";
import { format } from "@fast-csv/format";
import { prisma } from "../db.js";
import { permissions, requirePermission } from "../auth/rbac.js";

export async function exportRoutes(app: FastifyInstance) {
  app.get("/exports/events.csv", { preHandler: requirePermission(permissions.exportsRun) }, async (request, reply) => {
    const events = await prisma.event.findMany({
      where: { tenantId: request.user!.tenantId, deletedAt: null },
      include: { assignments: { include: { user: true } }, logistics: true },
      orderBy: { startsAt: "asc" }
    });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=bolos.csv");
    const stream = format({ headers: true });
    stream.pipe(reply.raw);
    for (const event of events) {
      stream.write({
        titulo: event.title,
        inicio: event.startsAt.toISOString(),
        fin: event.endsAt.toISOString(),
        ciudad: event.city,
        local: event.venueName,
        estado: event.status,
        asignados: event.assignments.map((a) => `${a.user?.name ?? a.externalName ?? "Freelance"}:${a.role}`).join(" | ")
      });
    }
    stream.end();
    return reply;
  });
}
