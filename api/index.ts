import { buildApp } from "../apps/api/src/server.ts";

const app = buildApp();

function normalizeUrl(req: any) {
  if (typeof req.url !== "string") return;
  const base = "https://md-ops.local";
  const url = new URL(req.url, base);
  const rewrittenPath = url.searchParams.get("path");

  if (rewrittenPath) {
    url.searchParams.delete("path");
    const path = rewrittenPath.startsWith("/") ? rewrittenPath : `/${rewrittenPath}`;
    if (path === "/health" || path === "/api/health") {
      req.url = `/health${url.search}`;
      return;
    }
    req.url = path.startsWith("/api/") ? `${path}${url.search}` : `/api${path}${url.search}`;
    return;
  }

  if (url.pathname === "/api/health") {
    req.url = `/health${url.search}`;
  }
}

// UNIFICADO EN UN SOLO EXPORT DEFAULT MAESTRO
export default async function handler(req: any, res: any) {
  normalizeUrl(req);

  // Interceptamos la ruta de Health/Bootstrap para responder de inmediato sin cargar plugins si se desea
  if (req.url.startsWith("/health") || req.url.startsWith("/api/health") || req.url.startsWith("/bootstrap")) {
    const body = JSON.stringify({ 
      ok: true, 
      service: "api", 
      bootstrapped: true,
      timestamp: new Date().toISOString() 
    });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    res.end(body);
    return;
  }

  // Para el resto de rutas de la API, delegamos el control a Fastify
  await app.ready();
  app.server.emit("request", req, res);
}
