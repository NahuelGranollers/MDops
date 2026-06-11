import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { env } from "../config/env.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const loginAliases: Record<string, string> = {
  admin: "admin@md.local",
  albert: "albert@md.local",
  ferran: "ferran@md.local",
  lake: "lake@md.local",
  lago: "lake@md.local",
  "david lago": "lake@md.local",
  nahuel: "nahuel@md.local",
  dani: "dani@md.local",
  alex: "alex@md.local",
  xavi: "xavi@md.local",
  david: "david@md.local",
  sancho: "david@md.local",
  "david sancho": "david@md.local",
  "david s": "david@md.local",
  davids: "david@md.local",
  pissarra: "pissarra@md.local"
};

function normalizeIdentifier(identifier: string) {
  return identifier
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function resolveLoginEmail(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  if (normalized.includes("@")) return normalized;
  return loginAliases[normalized] ?? `${normalized.replaceAll(" ", ".")}@md.local`;
}

export async function buildUserSession(userId: string) {
  const user = await prisma.user.findFirstOrThrow({
    where: { id: userId, deletedAt: null, isActive: true },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } }
  });
  const roles = user.roles.map((item: { role: { key: string } }) => item.role.key);
  const permissions = [...new Set(user.roles.flatMap((item: Prisma.UserRoleGetPayload<{ include: { role: { include: { permissions: { include: { permission: true } } } } } }>) => item.role.permissions.map((rp: { permission: { key: string } }) => rp.permission.key)))];
  return { id: user.id, tenantId: user.tenantId, email: user.email, notificationEmail: user.notificationEmail, name: user.name, profileColor: user.profileColor, avatarUrl: user.avatarUrl, roles, permissions };
}

export async function issueSession(userId: string) {
  const sessionUser = await buildUserSession(userId);
  const accessToken = jwt.sign(sessionUser, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"] });
  const refreshToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { userId, tokenHash: hashToken(refreshToken), expiresAt } });
  return { accessToken, refreshToken, user: sessionUser };
}

export async function login(identifier: string, password: string) {
  const email = resolveLoginEmail(identifier);
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, isActive: true }
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error("Credenciales invalidas.");
  }
  return issueSession(user.id);
}

export function getAutoLoginStatus() {
  const enabled = env.AUTOLOGIN_ENABLED && (env.NODE_ENV !== "production" || env.AUTOLOGIN_ALLOW_PRODUCTION);
  return { enabled };
}

export async function autoLogin(identifier?: string) {
  const status = getAutoLoginStatus();
  if (!status.enabled) throw new Error("Autologin desactivado.");
  const resolvedIdentifier = identifier || env.AUTOLOGIN_IDENTIFIER;
  if (!resolvedIdentifier) throw new Error("No hay sesión anterior.");
  const email = resolveLoginEmail(resolvedIdentifier);
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, isActive: true }
  });
  if (!user) throw new Error("Usuario de autologin no encontrado.");
  return issueSession(user.id);
}

export async function refresh(refreshToken: string) {
  const token = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!token || token.revokedAt || token.expiresAt < new Date()) throw new Error("Refresh token invalido.");
  const user = await buildUserSession(token.userId);
  return jwt.sign(user, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"] });
}

export async function revokeRefreshToken(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true }
  });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new Error("La contraseña actual no es correcta.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    })
  ]);

  return { ok: true };
}
