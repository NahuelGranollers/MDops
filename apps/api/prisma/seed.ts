import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const permissionKeys = [
  ["events:read:all", "Ver todos los bolos"],
  ["events:read:own", "Ver bolos propios"],
  ["events:write", "Crear y editar bolos"],
  ["users:manage", "Gestionar usuarios"],
  ["availability:own", "Gestionar indisponibilidad propia"],
  ["availability:manage", "Aprobar indisponibilidad"],
  ["settings:manage", "Editar configuracion"],
  ["exports:run", "Exportar datos"],
  ["audit:read", "Ver auditoria"]
] as const;

async function findUserByEmails(tenantId: string, emails: string[]) {
  return prisma.user.findFirst({
    where: { tenantId, email: { in: emails } },
    orderBy: { createdAt: "asc" }
  });
}

async function ensureSeedUser(input: {
  tenantId: string;
  name: string;
  email: string;
  legacyEmails?: string[];
  profileColor?: string;
  passwordHash: string;
  roleId: string;
}) {
  const emails = [input.email, ...(input.legacyEmails ?? [])];
  const existing = await findUserByEmails(input.tenantId, emails);
  const user = existing
    ? await prisma.user.update({
      where: { id: existing.id },
      data: { name: input.name, email: input.email, profileColor: input.profileColor ?? "#0f766e", passwordHash: input.passwordHash, isActive: true, deletedAt: null }
    })
    : await prisma.user.create({
      data: { tenantId: input.tenantId, name: input.name, email: input.email, profileColor: input.profileColor ?? "#0f766e", passwordHash: input.passwordHash }
    });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: input.roleId } },
    update: {},
    create: { userId: user.id, roleId: input.roleId }
  });

  return user;
}

async function syncUserRoles(userId: string, roleIds: string[]) {
  await prisma.userRole.deleteMany({ where: { userId } });
  await prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "md" },
    update: {},
    create: { name: "MD", slug: "md", timezone: "Europe/Madrid" }
  });

  for (const [key, description] of permissionKeys) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }

  const admin = await prisma.role.upsert({
    where: { key: "admin" },
    update: {},
    create: { key: "admin", name: "Admin", description: "Administracion completa" }
  });
  const technician = await prisma.role.upsert({
    where: { key: "technician" },
    update: {},
    create: { key: "technician", name: "Tecnico", description: "Usuario operativo" }
  });
  const assembler = await prisma.role.upsert({
    where: { key: "assembler" },
    update: { name: "Montador", description: "Montaje y desmontaje" },
    create: { key: "assembler", name: "Montador", description: "Montaje y desmontaje" }
  });
  const driver = await prisma.role.upsert({
    where: { key: "driver" },
    update: { name: "Transporte", description: "Transporte" },
    create: { key: "driver", name: "Transporte", description: "Transporte" }
  });
  const support = await prisma.role.upsert({
    where: { key: "support" },
    update: { name: "Apoyo", description: "Apoyo puntual" },
    create: { key: "support", name: "Apoyo", description: "Apoyo puntual" }
  });

  const allPermissions = await prisma.permission.findMany();
  await prisma.rolePermission.deleteMany({ where: { roleId: admin.id } });
  await prisma.rolePermission.createMany({ data: allPermissions.map((permission) => ({ roleId: admin.id, permissionId: permission.id })) });
  const ownPermissions = allPermissions.filter((permission) => ["events:read:own", "availability:own"].includes(permission.key));
  await prisma.rolePermission.deleteMany({ where: { roleId: technician.id } });
  await prisma.rolePermission.createMany({ data: ownPermissions.map((permission) => ({ roleId: technician.id, permissionId: permission.id })) });
  for (const role of [assembler, driver, support]) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: ownPermissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  }

  const passwordHash = await bcrypt.hash("2001", 12);
  await ensureSeedUser({ tenantId: tenant.id, name: "Admin", email: "admin@md.local", profileColor: "#64748b", passwordHash, roleId: admin.id });
  await ensureSeedUser({ tenantId: tenant.id, name: "Albert", email: "albert@md.local", profileColor: "#0f766e", passwordHash, roleId: admin.id });
  await ensureSeedUser({ tenantId: tenant.id, name: "David Lago", email: "lake@md.local", legacyEmails: ["david.lago@md.local"], profileColor: "#2563eb", passwordHash, roleId: admin.id });
  await ensureSeedUser({ tenantId: tenant.id, name: "Ferran", email: "ferran@md.local", profileColor: "#7c3aed", passwordHash, roleId: admin.id });

  const dani = await ensureSeedUser({ tenantId: tenant.id, name: "Dani", email: "dani@md.local", profileColor: "#dc2626", passwordHash, roleId: technician.id });
  const nahuelUser = await ensureSeedUser({ tenantId: tenant.id, name: "Nahuel", email: "nahuel@md.local", profileColor: "#0891b2", passwordHash, roleId: technician.id });
  const davidSancho = await ensureSeedUser({ tenantId: tenant.id, name: "David Sancho", email: "david@md.local", legacyEmails: ["david.s@md.local", "david.sancho@md.local"], profileColor: "#ea580c", passwordHash, roleId: assembler.id });
  const alex = await ensureSeedUser({ tenantId: tenant.id, name: "Àlex", email: "alex@md.local", profileColor: "#16a34a", passwordHash, roleId: driver.id });
  const xavi = await ensureSeedUser({ tenantId: tenant.id, name: "Xavi", email: "xavi@md.local", profileColor: "#9333ea", passwordHash, roleId: support.id });
  await syncUserRoles(dani.id, [technician.id]);
  await syncUserRoles(nahuelUser.id, [technician.id]);
  await syncUserRoles(davidSancho.id, [assembler.id]);
  await syncUserRoles(alex.id, [driver.id, assembler.id]);
  await syncUserRoles(xavi.id, [support.id]);

  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "minRestHours" } },
    update: { value: 10 },
    create: { tenantId: tenant.id, key: "minRestHours", value: 10 }
  });
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "restConflictMode" } },
    update: { value: "warn" },
    create: { tenantId: tenant.id, key: "restConflictMode", value: "warn" }
  });
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "timezone" } },
    update: { value: "Europe/Madrid" },
    create: { tenantId: tenant.id, key: "timezone", value: "Europe/Madrid" }
  });

  const nahuel = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId: tenant.id, email: "nahuel@md.local" } } });
  const albert = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId: tenant.id, email: "albert@md.local" } } });
  const existing = await prisma.event.count({ where: { tenantId: tenant.id } });
  if (existing === 0) {
    await prisma.event.create({
      data: {
        tenantId: tenant.id,
        title: "Bolo inicial - Sala Apolo",
        startsAt: new Date("2026-06-01T18:00:00.000Z"),
        endsAt: new Date("2026-06-02T01:30:00.000Z"),
        city: "Barcelona",
        venueName: "Sala Apolo",
        venueAddress: "Carrer Nou de la Rambla, 113, Barcelona",
        status: "confirmed",
        visibleNotes: "Llegar con margen para montaje.",
        internalNotes: "Revisar el material antes de salir.",
        tags: ["audio", "noche"],
        createdById: albert.id,
        logistics: { create: { departureAt: new Date("2026-06-01T15:30:00.000Z") } },
        assignments: { create: [{ userId: nahuel.id, role: "technician" }] }
      }
    });
  }

  console.log("Seed completado. Usuarios: admin, albert, lake/lago, ferran, nahuel, dani, david/sancho, alex, xavi. Password inicial para todos: 2001");
}

main().finally(async () => prisma.$disconnect());
