import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireSystemManager } from "../auth/rbac.js";
import { publish } from "../realtime/bus.js";
import { getEmailNotificationStatus, sendTestEmail } from "../notifications/email-service.js";

const settingSchema = z.object({
  minRestHours: z.number().int().min(1).max(24),
  restConflictMode: z.enum(["warn", "block"]),
  timezone: z.string().min(1)
});

const emailTestSchema = z.object({
  to: z.string().email()
});

export async function settingRoutes(app: FastifyInstance) {
  app.get("/settings", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const settings = await prisma.setting.findMany({ where: { tenantId: request.user.tenantId } });
    return Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  });

  app.put("/settings", { preHandler: requireSystemManager() }, async (request) => {
    const input = settingSchema.parse(request.body);
    await Promise.all(Object.entries(input).map(([key, value]) => prisma.setting.upsert({
      where: { tenantId_key: { tenantId: request.user!.tenantId, key } },
      create: { tenantId: request.user!.tenantId, key, value },
      update: { value }
    })));
    publish({ tenantId: request.user!.tenantId, topic: "settings", payload: { action: "updated" } });
    return input;
  });

  app.get("/settings/email", { preHandler: requireSystemManager() }, async () => {
    return getEmailNotificationStatus();
  });

  app.post("/settings/email/test", { preHandler: requireSystemManager() }, async (request, reply) => {
    const input = emailTestSchema.parse(request.body);
    try {
      await sendTestEmail(input.to, request.user?.name);
      return { ok: true };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "No se ha podido enviar el correo de prueba.");
    }
  });
}
