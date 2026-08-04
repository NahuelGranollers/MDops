const HEALTH_PATHS = new Set(["/health", "/bootstrap", "/api/health", "/api/bootstrap"]);

function buildJsonResponse(payload: Record<string, unknown>, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

export default async function handler(req: any, res: any) {
  const url = new URL(req.url ?? "/", `http://${req.headers?.host ?? "localhost"}`);

  if (HEALTH_PATHS.has(url.pathname)) {
    const payload = url.pathname.startsWith("/api")
      ? { bootstrapped: true, message: "API cargada exitosamente" }
      : { ok: true, service: "api" };

    if (url.pathname.endsWith("bootstrap") || url.pathname === "/bootstrap" || url.pathname === "/api/bootstrap") {
      const response = buildJsonResponse({ bootstrapped: true, message: "API cargada exitosamente" });
      res.statusCode = response.statusCode;
      res.setHeader("content-type", response.headers["content-type"]);
      res.end(response.body);
      return;
    }

    const response = buildJsonResponse({ ok: true, service: "api" });
    res.statusCode = response.statusCode;
    res.setHeader("content-type", response.headers["content-type"]);
    res.end(response.body);
    return;
  }

  try {
    const mod = await import("../apps/api/src/server.ts");
    return await mod.default(req, res);
  } catch (error) {
    const response = buildJsonResponse({ message: error instanceof Error ? error.message : "Error interno." }, 500);
    res.statusCode = response.statusCode;
    res.setHeader("content-type", response.headers["content-type"]);
    res.end(response.body);
  }
}
