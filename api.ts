import { IncomingMessage, ServerResponse } from "http";

export default (req: IncomingMessage, res: ServerResponse) => {
  const path = req.url || "/";
  
  // Health check
  if (path === "/health") {
    const body = JSON.stringify({ ok: true, service: "api", timestamp: new Date().toISOString() });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    return res.end(body);
  }
  
  // Root
  if (path === "/") {
    const body = JSON.stringify({ message: "MD Ops API" });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    return res.end(body);
  }
  
  // 404
  const body = JSON.stringify({ error: "Not Found" });
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(body);
};
