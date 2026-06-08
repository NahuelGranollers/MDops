import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSessionLogInfo, logSession } from "./session-log.js";

const clientLogSchema = z.object({
  type: z.string().min(2).max(80).default("client_event"),
  message: z.string().max(500).optional(),
  path: z.string().max(300).optional(),
  method: z.string().max(20).optional(),
  statusCode: z.number().int().optional(),
  durationMs: z.number().optional(),
  data: z.unknown().optional()
});

export async function sessionLogRoutes(app: FastifyInstance) {
  app.get("/session-log", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const info = getSessionLogInfo();
    return { sessionId: info.sessionId, startedAt: info.startedAt, logFile: info.logFile };
  });

  app.post("/session-log", async (request) => {
    const input = clientLogSchema.parse(request.body);
    logSession({
      type: input.type,
      tenantId: request.user?.tenantId,
      actorId: request.user?.id,
      method: input.method,
      url: input.path,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      message: input.message,
      data: input.data
    });
    return { ok: true };
  });
}
