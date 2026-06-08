import { prisma } from "../db.js";
import { logSession } from "../session-log.js";
import type { AuthUser } from "../types.js";

export async function audit(actor: AuthUser | undefined, action: any, entity: string, entityId: string, before?: unknown, after?: unknown) {
  const tenantId = actor?.tenantId ?? (after as any)?.tenantId ?? (before as any)?.tenantId;
  if (!tenantId) return;
  await prisma.auditLog.create({
    data: { tenantId, actorId: actor?.id, action, entity, entityId, before: before as any, after: after as any }
  });
  logSession({ type: "audit", tenantId, actorId: actor?.id, message: `${action}:${entity}`, data: { action, entity, entityId } });
}
