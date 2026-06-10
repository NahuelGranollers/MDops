import { handleOptions } from "./_cors.ts";

export default function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;
  res.status(200).json({ ok: true, service: "api", runtime: "vercel" });
}
