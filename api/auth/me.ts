import { handleOptions } from "../_cors.ts";

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Metodo no permitido." });
  }

  try {
    const [{ buildUserSession }, { env }, jwt] = await Promise.all([
      import("../../apps/api/src/auth/service.ts"),
      import("../../apps/api/src/config/env.ts"),
      import("jsonwebtoken")
    ]);
    const header = req.headers?.authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No autorizado." });
    }
    const payload = jwt.default.verify(header.slice(7), env.JWT_ACCESS_SECRET) as any;
    const user = await buildUserSession(payload.id);
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : "No autorizado."
    });
  }
}
