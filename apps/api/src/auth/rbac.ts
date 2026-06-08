import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "../types.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const permissions = {
  eventsReadAll: "events:read:all",
  eventsReadOwn: "events:read:own",
  eventsWrite: "events:write",
  usersManage: "users:manage",
  availabilityOwn: "availability:own",
  availabilityManage: "availability:manage",
  settingsManage: "settings:manage",
  exportsRun: "exports:run",
  auditRead: "audit:read"
} as const;

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) return reply.unauthorized("Sesion requerida.");
    if (!request.user.permissions.includes(permission)) {
      return reply.forbidden("No tienes permiso para esta accion.");
    }
  };
}

export function isAdmin(user: AuthUser) {
  return user.roles.includes("admin");
}

export function canManageSystem(user: AuthUser) {
  const email = user.email.toLowerCase();
  const name = user.name.trim().toLowerCase();
  return email === "admin@md.local" || email === "ferran@md.local" || name === "ferran";
}

export function requireSystemManager() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) return reply.unauthorized("Sesion requerida.");
    if (!canManageSystem(request.user)) return reply.forbidden("Solo admin y Ferran pueden tocar estos ajustes.");
  };
}
