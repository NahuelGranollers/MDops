import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { subscribe } from "./bus.js";
import { env } from "../config/env.js";

export async function realtimeRoutes(app: FastifyInstance) {
  app.get("/stream", async (request, reply) => {
    const query = request.query as { token?: string };
    if (!request.user && query.token) {
      try {
        request.user = jwt.verify(query.token, env.JWT_ACCESS_SECRET) as any;
      } catch {
        request.user = undefined;
      }
    }
    if (!request.user) return reply.unauthorized();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const send = (event: any) => {
      if (event.tenantId === request.user!.tenantId) {
        reply.raw.write(`event: ${event.topic}\n`);
        reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`);
      }
    };
    const unsubscribe = subscribe(send);
    request.raw.on("close", unsubscribe);
    reply.raw.write(`event: ready\ndata: {"ok":true}\n\n`);
  });
}
