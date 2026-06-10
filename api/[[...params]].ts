export default (req: any, res: any) => {
  const path = req.url || "/";
  
  // Health check endpoints
  if (path === "/health" || path === "/api/health") {
    const body = JSON.stringify({ ok: true, service: "api", timestamp: new Date().toISOString() });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    return res.end(body);
  }
  
  // Root endpoint
  if (path === "/" || path === "/api") {
    const body = JSON.stringify({ message: "MD Ops API", version: "1.0.0" });
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    return res.end(body);
  }
  
  // 404
  const body = JSON.stringify({ error: "Not Found", path });
  res.writeHead(404, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};
