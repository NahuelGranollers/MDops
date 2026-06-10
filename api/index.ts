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

export default async function handler(req: any, res: any) {
  normalizeUrl(req);
  await app.ready();
  app.server.emit("request", req, res);
}
