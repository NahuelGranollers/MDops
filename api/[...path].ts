import type { VercelRequest, VercelResponse } from "@vercel/node";

// Placeholder API responses until full server is built
const mockEndpoints: Record<string, any> = {
  "/health": { ok: true, service: "api", runtime: "vercel" },
  "/api/health": { ok: true, service: "api", runtime: "vercel" },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url || "";
  
  // Check for mock endpoints
  if (path in mockEndpoints) {
    return res.status(200).json(mockEndpoints[path]);
  }
  
  // Check for health endpoints with regex
  if (path.includes("health")) {
    return res.status(200).json({ ok: true, service: "api" });
  }
  
  // Default 404
  res.status(404).json({ error: "Not Found" });
}
