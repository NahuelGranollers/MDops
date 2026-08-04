const HEALTH_PATHS = new Set(["/health", "/bootstrap", "/api/health", "/api/bootstrap"]);

function buildJsonResponse(payload: Record<string, unknown>, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

export default async function handler(req: any, res: any) {
  const rawUrl = req.url ?? "/";
  const normalizedPath = rawUrl.split("?")[0].split("#")[0];
  const url = new URL(normalizedPath, `http://${req.headers?.host ?? "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (HEALTH_PATHS.has(pathname)) {
    const response = pathname === "/bootstrap" || pathname === "/api/bootstrap" || pathname.endsWith("/bootstrap")
      ? buildJsonResponse({ bootstrapped: true, message: "API cargada exitosamente" })
      : buildJsonResponse({ ok: true, service: "api" });

    res.statusCode = response.statusCode;
    res.setHeader("content-type", response.headers["content-type"]);
    res.end(response.body);
    return;
  }

  try {
    const mod = await import("../src/server.ts");
    return await mod.default(req, res);
  } catch (error) {
    const response = buildJsonResponse({ message: error instanceof Error ? error.message : "Error interno." }, 500);
    res.statusCode = response.statusCode;
    res.setHeader("content-type", response.headers["content-type"]);
    res.end(response.body);
  }
}
