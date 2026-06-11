import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import jwt from "jsonwebtoken";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { authRoutes } from "./auth/routes.js";
import { eventRoutes } from "./events/routes.js";
import { availabilityRoutes } from "./availability/routes.js";
import { userRoutes } from "./users/routes.js";
import { notificationRoutes } from "./notifications/routes.js";
import { mapRoutes } from "./maps/routes.js";
import { exportRoutes } from "./exports/routes.js";
import { auditRoutes } from "./audit/routes.js";
import { realtimeRoutes } from "./realtime/routes.js";
import { settingRoutes } from "./settings/routes.js";
import { sessionLogRoutes } from "./session-log-routes.js";
import { getSessionLogInfo, logSession } from "./session-log.js";
import type { AuthUser } from "./types.js"; // Asegúrate de que la ruta a tus tipos sea correcta

// Extensión global de tipos para que Fastify reconozca request.user sin errores
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function corsOrigins() {
  return env.CORS_ORIGIN.split(",").map((origin) => {
    const trimmed = origin.trim();
    if (!trimmed) return trimmed;
    try {
      return new URL(trimmed).origin;
    } catch {
      return trimmed;
    }
  }).filter(Boolean);
}

export function buildApp() {
  const app = Fastify({ logger: true });
  const requestStarts = new WeakMap<object, number>();
  app.register(sensible);
  app.register(helmet);
  app.register(cors, { origin: corsOrigins(), credentials: true, methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 } });
  const uploadRoot = path.resolve(env.UPLOAD_DIR);
  mkdirSync(uploadRoot, { recursive: true });
  app.register(staticFiles, { root: uploadRoot, prefix: "/uploads/" });

  app.addHook("onRequest", async (request) => {
    requestStarts.set(request, Date.now());
  });

  app.addHook("preHandler", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    try {
      request.user = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AuthUser;
    } catch {
      request.user = undefined;
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationMs = Date.now() - (requestStarts.get(request) ?? Date.now());
    if (reply.statusCode >= 400 || durationMs >= env.SESSION_LOG_SLOW_MS || request.method !== "GET") {
      logSession({
        type: reply.statusCode >= 400 ? "http_error_response" : "http_request",
        tenantId: request.user?.tenantId,
        actorId: request.user?.id,
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs
      });
    }
  });

  app.addHook("onError", async (request, reply, error) => {
    const durationMs = Date.now() - (requestStarts.get(request) ?? Date.now());
    logSession({
      type: "http_exception",
      tenantId: request.user?.tenantId,
      actorId: request.user?.id,
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs,
      message: error.message,
      data: { name: error.name, stack: error.stack }
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ message: "Datos invalidos.", issues: error.flatten() });
    app.log.error(error);
    const typedError = error as { statusCode?: number; message?: string };
    return reply.status(typedError.statusCode ?? 500).send({ message: typedError.message || "Error interno." });
  });

  // ─── ENDPOINTS DE VERIFICACIÓN DE PIPELINE (EVITAN ERRORES 404) ───
  app.get("/health", async () => ({ ok: true, service: "api" }));
  app.get("/bootstrap", async () => ({ bootstrapped: true, message: "API cargada exitosamente" }));

  // Rutas del Monorrepo
  app.register(authRoutes, { prefix: "/api" });
  app.register(eventRoutes, { prefix: "/api" });
  app.register(availabilityRoutes, { prefix: "/api" });
  app.register(userRoutes, { prefix: "/api" });
  app.register(notificationRoutes, { prefix: "/api" });
  app.register(mapRoutes, { prefix: "/api" });
  app.register(exportRoutes, { prefix: "/api" });
  app.register(auditRoutes, { prefix: "/api" });
  app.register(realtimeRoutes, { prefix: "/api" });
  app.register(settingRoutes, { prefix: "/api" });
  app.register(sessionLogRoutes, { prefix: "/api" });
  return app;
}

// Inicialización de la aplicación
const appInstance = buildApp();

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  try {
    const address = await appInstance.listen({ host: "0.0.0.0", port: env.API_PORT });
    logSession({
      type: "server_listen",
      message: `API listening at ${address}`,
      data: { address, logFile: getSessionLogInfo().logFile }
    });
  } catch (err) {
    appInstance.log.error(err);
    process.exit(1);
  }
}

// Exportación requerida para que vercel.json empaquete las funciones Serverless de Fastify
export default async function handler(req: any, reply: any) {
  await appInstance.ready();
  appInstance.server.emit("request", req, reply);
}
