const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");

const toolsDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(".mdops-cloud-tools");
const requireTools = createRequire(path.join(toolsDir, "package.json"));
const { Pool } = requireTools("pg");
const bcrypt = requireTools("bcryptjs");

const permissions = [
  ["events:read:all", "Ver todos los bolos"],
  ["events:read:own", "Ver bolos propios"],
  ["events:write", "Crear y editar bolos"],
  ["users:manage", "Gestionar usuarios"],
  ["availability:own", "Gestionar indisponibilidad propia"],
  ["availability:manage", "Aprobar indisponibilidad"],
  ["settings:manage", "Editar configuracion"],
  ["exports:run", "Exportar datos"],
  ["audit:read", "Ver auditoria"]
];

const users = [
  ["Admin", "admin@md.local", "#64748b", ["admin"]],
  ["Albert", "albert@md.local", "#0f766e", ["admin"]],
  ["David Lago", "lake@md.local", "#2563eb", ["admin"]],
  ["Ferran", "ferran@md.local", "#7c3aed", ["admin"]],
  ["Dani", "dani@md.local", "#dc2626", ["technician"]],
  ["Nahuel", "nahuel@md.local", "#0891b2", ["technician"]],
  ["David Sancho", "david@md.local", "#ea580c", ["assembler"]],
  ["Alex", "alex@md.local", "#16a34a", ["driver", "assembler"]],
  ["Xavi", "xavi@md.local", "#9333ea", ["support"]]
];

const roleDefinitions = [
  ["admin", "Admin", "Administracion completa"],
  ["technician", "Tecnico", "Usuario operativo"],
  ["assembler", "Montador", "Montaje y desmontaje"],
  ["driver", "Transporte", "Transporte"],
  ["support", "Apoyo", "Apoyo puntual"]
];

async function upsertOne(client, sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tenant = await upsertOne(
      client,
      `INSERT INTO "Tenant" ("id", "name", "slug", "timezone", "updatedAt")
       VALUES ($1, 'MD', 'md', 'Europe/Madrid', CURRENT_TIMESTAMP)
       ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "timezone" = EXCLUDED."timezone", "updatedAt" = CURRENT_TIMESTAMP
       RETURNING "id"`,
      [randomUUID()]
    );

    const permissionIds = new Map();
    for (const [key, description] of permissions) {
      const permission = await upsertOne(
        client,
        `INSERT INTO "Permission" ("id", "key", "description")
         VALUES ($1, $2, $3)
         ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description"
         RETURNING "id"`,
        [randomUUID(), key, description]
      );
      permissionIds.set(key, permission.id);
    }

    const roleIds = new Map();
    for (const [key, name, description] of roleDefinitions) {
      const role = await upsertOne(
        client,
        `INSERT INTO "Role" ("id", "key", "name", "description")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description"
         RETURNING "id"`,
        [randomUUID(), key, name, description]
      );
      roleIds.set(key, role.id);
    }

    const adminPermissions = [...permissionIds.values()];
    const ownPermissions = ["events:read:own", "availability:own"].map((key) => permissionIds.get(key));
    for (const [roleKey, permissionList] of [
      ["admin", adminPermissions],
      ["technician", ownPermissions],
      ["assembler", ownPermissions],
      ["driver", ownPermissions],
      ["support", ownPermissions]
    ]) {
      const roleId = roleIds.get(roleKey);
      await client.query(`DELETE FROM "RolePermission" WHERE "roleId" = $1`, [roleId]);
      for (const permissionId of permissionList) {
        await client.query(
          `INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleId, permissionId]
        );
      }
    }

    const passwordHash = await bcrypt.hash("2001", 12);
    for (const [name, email, profileColor, roleKeys] of users) {
      const user = await upsertOne(
        client,
        `INSERT INTO "User" ("id", "tenantId", "name", "email", "profileColor", "passwordHash", "isActive", "deletedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, true, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId", "email") DO UPDATE SET
           "name" = EXCLUDED."name",
           "profileColor" = EXCLUDED."profileColor",
           "passwordHash" = EXCLUDED."passwordHash",
           "isActive" = true,
           "deletedAt" = NULL,
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING "id"`,
        [randomUUID(), tenant.id, name, email, profileColor, passwordHash]
      );

      await client.query(`DELETE FROM "UserRole" WHERE "userId" = $1`, [user.id]);
      for (const roleKey of roleKeys) {
        await client.query(
          `INSERT INTO "UserRole" ("userId", "roleId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [user.id, roleIds.get(roleKey)]
        );
      }
    }

    for (const [key, value] of [
      ["minRestHours", 10],
      ["restConflictMode", "warn"],
      ["timezone", "Europe/Madrid"]
    ]) {
      await client.query(
        `INSERT INTO "Setting" ("id", "tenantId", "key", "value", "updatedAt")
         VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT ("tenantId", "key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP`,
        [randomUUID(), tenant.id, key, JSON.stringify(value)]
      );
    }

    await client.query("COMMIT");
    console.log("Seed completado. Usuario admin / password 2001");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
