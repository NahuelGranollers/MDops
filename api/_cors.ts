const allowedOrigins = [
  "https://nahuelgranollers.github.io",
  "https://nahuelgranollers.github.io/MDops",
  "http://localhost:3000"
];

export function applyCors(req: any, res: any) {
  const origin = req.headers?.origin;
  let normalizedOrigin = "";
  try {
    normalizedOrigin = typeof origin === "string" ? new URL(origin).origin : "";
  } catch {
    normalizedOrigin = "";
  }
  if (allowedOrigins.includes(normalizedOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

export function handleOptions(req: any, res: any) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
