import Fastify, { type FastifyInstance } from "fastify";
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
import type { AuthUser } from "./types.js";
function createAppInstance() {
  if (appInstance) return appInstance;
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
  
  try {
    const uploadRoot = path.resolve(env.UPLOAD_DIR || "/tmp");
    mkdirSync(uploadRoot, { recursive: true });
    app.register(staticFiles, { root: uploadRoot, prefix: "/uploads/" });
  } catch (e) {
    console.error("Error inicializando directorio de subidas:", e);
  }

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
      try {
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
      } catch (e) {
        app.log.error(e, "Error al registrar logSession en onResponse");
      }
    }
  });

  app.addHook("onError", async (request, reply, error) => {
    const durationMs = Date.now() - (requestStarts.get(request) ?? Date.now());
    try {
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
    } catch (e) {
      app.log.error(e, "Error al registrar logSession en onError");
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ message: "Datos invalidos.", issues: error.flatten() });
    app.log.error(error);
    const typedError = error as { statusCode?: number; message?: string };
    return reply.status(typedError.statusCode ?? 500).send({ message: typedError.message || "Error interno." });
  });

  app.get("/health", async () => ({ ok: true, service: "api" }));
  app.get("/bootstrap", async () => ({ bootstrapped: true, message: "API cargada exitosamente" }));
  app.get("/api/health", async () => ({ ok: true, service: "api" }));
  app.get("/api/bootstrap", async () => ({ bootstrapped: true, message: "API cargada exitosamente" }));

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

function buildFallbackApp(initError: any) {
  const app = Fastify({ logger: false });
  
  // Rutas de emergencia que exponen el error para depuración rápida
  const debugHandler = async () => ({
    ok: false,
    error: initError instanceof Error ? initError.message : String(initError),
    stack: initError instanceof Error ? initError.stack : null,
    hint: "Revisa las variables de entorno de Vercel o inicializaciones de módulos globales (Prisma, Zod, env.js)"
  });

  app.get("/health", debugHandler);
  app.get("/bootstrap", debugHandler);
  app.get("/api/health", debugHandler);
  app.get("/api/bootstrap", debugHandler);
  
  app.setErrorHandler((_error, _request, reply) => reply.status(500).send({ message: "Fallback app error." }));
  return app;
}

let appInstance: FastifyInstance | null = null;
let appInitError: unknown = null;

function createAppInstance() {
  if (appInstance) return appInstance;
  try {
    appInstance = buildApp();
  } catch (error) {
    appInitError = error;
    appInstance = buildFallbackApp(error);
  }
  return appInstance;
}

const app = createAppInstance();

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  try {
    const address = await app.listen({ host: "0.0.0.0", port: env.API_PORT });
    logSession({
      type: "server_listen",
      message: `API listening at ${address}`,
      data: { address, logFile: getSessionLogInfo().logFile }
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export default async function handler(req: any, res: any) {
  const origin = req.headers.origin || "*";

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.end();
    return;
  }

  // Asegura capturar el error de inicialización actual antes de procesar la petición
  const appToHandle = createAppInstance();
  
  if (appInitError) {
    res.statusCode = 500;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      message: "Error crítico durante buildApp()",
      error: appInitError instanceof Error ? appInitError.message : String(appInitError),
      stack: appInitError instanceof Error ? appInitError.stack : null
    }));
    return;
  }

  try {
    await appToHandle.ready();
    const payload = req.body !== undefined ? (typeof req.body === "string" ? req.body : JSON.stringify(req.body)) : undefined;
    const response = await appToHandle.inject({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers ?? {},
      payload
    });

    for (const [key, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      res.setHeader(key, Array.isArray(value) ? value.join(",") : String(value));
    }
    res.statusCode = response.statusCode;
    res.end(response.body);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ 
      message: "Error en la inyección de la petición", 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null 
    }));
  }
}
  if ((globalThis as any)._envValidationError) {
    appInitError = (globalThis as any)._envValidationError;
    appInstance = buildFallbackApp((globalThis as any)._envValidationError);
    return appInstance;
  }

  try {
    appInstance = buildApp();
  } catch (error) {
    appInitError = error;
    appInstance = buildFallbackApp(error);
  }
  return appInstance;
}