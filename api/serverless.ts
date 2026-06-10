import { buildApp } from "../apps/api/src/server.ts";

const app = buildApp();

function normalizeUrl(req: any) {
  if (typeof req.url !== "string") return;
  if (req.url.startsWith("/api/health")) {
    req.url = req.url.replace(/^\/api\/health/, "/health");
    return;
  }
  if (req.url.startsWith("/api/uploads/")) {
    req.url = req.url.replace(/^\/api\/uploads/, "/uploads");
    return;
  }
  if (!req.url.startsWith("/api/") && req.url !== "/health") {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }
}

export default async function handler(req: any, res: any) {
  normalizeUrl(req);
  await app.ready();
  app.server.emit("request", req, res);
}
