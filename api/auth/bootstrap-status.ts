import { handleOptions } from "../_cors.ts";

export default async function handler(req: any, res: any) {
  if (handleOptions(req, res)) return;
  try {
    const { prisma } = await import("../../apps/api/src/db.ts");
    const [userCount, hasAdmin] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.findFirst({ where: { email: "admin@md.local", deletedAt: null, isActive: true }, select: { id: true } })
    ]);
    res.status(200).json({ userCount, hasAdmin: Boolean(hasAdmin) });
  } catch (error) {
    res.status(500).json({
      message: "No se ha podido comprobar la base de datos.",
      error: error instanceof Error ? error.message : "Error desconocido"
    });
  }
}
