import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { rolePermissionsSchema, userCreateSchema, userUpdateSchema } from "@md-ops/shared";
import { prisma } from "../db.js";
import { canManageSystem, permissions, requireSystemManager, isAdmin } from "../auth/rbac.js";
import { audit } from "../audit/service.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/users", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const query = request.query as { assignable?: string };
    const assignableOnly = query.assignable === "true";
    if (assignableOnly) {
      if (!isAdmin(request.user)) return reply.forbidden();
    } else if (!canManageSystem(request.user)) {
      return reply.forbidden("Solo admin y Ferran pueden gestionar usuarios.");
    }
    return prisma.user.findMany({
      where: {
        tenantId: request.user!.tenantId,
        deletedAt: null,
        email: assignableOnly ? { not: "admin@md.local" } : undefined
      },
      select: { id: true, name: true, email: true, phone: true, profileColor: true, avatarUrl: true, isActive: true, roles: { include: { role: true } } },
      orderBy: { name: "asc" }
    });
  });

  app.get("/roles", { preHandler: requireSystemManager() }, async () => {
    const [roles, allPermissions] = await Promise.all([
      prisma.role.findMany({
        include: { permissions: { include: { permission: true }, orderBy: { permission: { key: "asc" } } } },
        orderBy: { name: "asc" }
      }),
      prisma.permission.findMany({ orderBy: { key: "asc" } })
    ]);
    return { roles, permissions: allPermissions };
  });

  app.post("/users", { preHandler: requireSystemManager() }, async (request, reply) => {
    const input = userCreateSchema.parse(request.body);
    const roles = await prisma.role.findMany({ where: { key: { in: input.roleKeys } } });
    const user = await prisma.user.create({
      data: {
        tenantId: request.user!.tenantId,
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        profileColor: input.profileColor ?? "#0f766e",
        passwordHash: await bcrypt.hash(input.password, 12),
        roles: { create: roles.map((role) => ({ roleId: role.id })) }
      },
      select: { id: true, name: true, email: true, profileColor: true, avatarUrl: true }
    });
    await audit(request.user, "create", "user", user.id, undefined, user);
    return reply.code(201).send(user);
  });

  app.put("/users/:id", { preHandler: requireSystemManager() }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = userUpdateSchema.parse(request.body);
    const before = await prisma.user.findFirst({
      where: { id, tenantId: request.user!.tenantId, deletedAt: null },
      include: { roles: { include: { role: true } } }
    });
    if (!before) return reply.notFound();

    const roles = await prisma.role.findMany({ where: { key: { in: input.roleKeys } } });
    if (roles.length !== input.roleKeys.length) return reply.badRequest("Hay roles invalidos.");

    const user = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      return tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          phone: input.phone,
          profileColor: input.profileColor,
          isActive: input.isActive
        },
        select: { id: true, name: true, email: true, phone: true, profileColor: true, avatarUrl: true, isActive: true, roles: { include: { role: true } } }
      });
    });
    await audit(request.user, "update", "user", id, before, user);
    return user;
  });

  app.post("/users/:id/cancel", { preHandler: requireSystemManager() }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user!.id) return reply.badRequest("No puedes cancelar tu propio usuario.");
    const before = await prisma.user.findFirst({ where: { id, tenantId: request.user!.tenantId, deletedAt: null } });
    if (!before) return reply.notFound();
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, name: true, email: true, phone: true, profileColor: true, avatarUrl: true, isActive: true, roles: { include: { role: true } } }
    });
    await audit(request.user, "cancel", "user", id, before, user);
    return user;
  });

  app.post("/users/:id/restore", { preHandler: requireSystemManager() }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const before = await prisma.user.findFirst({ where: { id, tenantId: request.user!.tenantId, deletedAt: null } });
    if (!before) return reply.notFound();
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: { id: true, name: true, email: true, phone: true, profileColor: true, avatarUrl: true, isActive: true, roles: { include: { role: true } } }
    });
    await audit(request.user, "update", "user", id, before, user);
    return user;
  });

  app.delete("/users/:id", { preHandler: requireSystemManager() }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user!.id) return reply.badRequest("No puedes eliminar tu propio usuario.");
    const before = await prisma.user.findFirst({ where: { id, tenantId: request.user!.tenantId, deletedAt: null } });
    if (!before) return reply.notFound();
    const user = await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, name: true, email: true, isActive: true }
    });
    await audit(request.user, "delete", "user", id, before, user);
    return user;
  });

  app.put("/roles/:key/permissions", { preHandler: requireSystemManager() }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const input = rolePermissionsSchema.parse(request.body);
    const role = await prisma.role.findUnique({ where: { key }, include: { permissions: { include: { permission: true } } } });
    if (!role) return reply.notFound();

    const requestedKeys = key === "admin"
      ? [...new Set([...input.permissionKeys, permissions.usersManage, permissions.settingsManage])]
      : input.permissionKeys;
    const permissionRows = await prisma.permission.findMany({ where: { key: { in: requestedKeys } } });
    if (permissionRows.length !== requestedKeys.length) return reply.badRequest("Hay permisos invalidos.");

    const updated = await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionRows.length) {
        await tx.rolePermission.createMany({ data: permissionRows.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
      }
      return tx.role.findUniqueOrThrow({
        where: { id: role.id },
        include: { permissions: { include: { permission: true }, orderBy: { permission: { key: "asc" } } } }
      });
    });
    await audit(request.user, "update", "role", role.id, role, updated);
    return updated;
  });
}
