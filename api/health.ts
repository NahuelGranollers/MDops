export default (req: any, res: any) => {
  const body = JSON.stringify({ ok: true, service: "api", timestamp: new Date().toISOString() });
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};
