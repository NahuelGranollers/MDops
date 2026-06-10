import { IncomingMessage, ServerResponse } from "http";

export default (req: IncomingMessage, res: ServerResponse) => {
  const path = req.url || "/";
  
  // Force a visible response
  const body = JSON.stringify({ 
    message: "MD Ops API - Version 2.0", 
    timestamp: new Date().toISOString(),
    path: path,
    endpoint: "Working"
  });
  
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-cache, no-store, must-revalidate"
  });
  res.end(body);
};
