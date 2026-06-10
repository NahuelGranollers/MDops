import { handleOptions } from "../_cors.ts";

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Metodo no permitido." });
  }

  try {
    const { login } = await import("../../apps/api/src/auth/service.ts");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const identifier = String(body?.identifier ?? "");
    const password = String(body?.password ?? "");
    const result = await login(identifier, password);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se ha podido entrar.";
    const status = message.includes("Credenciales") ? 401 : 500;
    return res.status(status).json({ message });
  }
}
