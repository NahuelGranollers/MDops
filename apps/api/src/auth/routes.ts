import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { changePasswordSchema, loginSchema, profileUpdateSchema } from "@md-ops/shared";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { autoLogin, buildUserSession, changePassword, getAutoLoginStatus, issueSession, login, refresh, revokeRefreshToken } from "./service.js";
import { prisma } from "../db.js";
import { setup2FA, enable2FA, disable2FA, verify2FA, get2FAStatus, regenerateRecoveryCodes } from "./two-factor.js";

export async function authRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    try {
      request.user = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as any;
    } catch {
      request.user = undefined;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await login(input.identifier, input.password);
    const user = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: { totpEnabled: true }
    });
    if (user?.totpEnabled) {
      const tempToken = jwt.sign(
        { userId: result.user.id, temp: true },
        env.JWT_ACCESS_SECRET,
        { expiresIn: "5m" as SignOptions["expiresIn"] }
      );
      return reply.send({ requires2FA: true, tempToken });
    }
    return reply.send(result);
  });

  app.get("/auth/autologin", async () => getAutoLoginStatus());

  app.get("/auth/bootstrap-status", async () => {
    const [userCount, hasAdmin] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.findFirst({ where: { email: "admin@md.local", deletedAt: null, isActive: true }, select: { id: true } })
    ]);
    return { userCount, hasAdmin: Boolean(hasAdmin) };
  });

  app.post("/auth/autologin", async (request, reply) => {
    const status = getAutoLoginStatus();
    if (!status.enabled) return reply.notFound("Autologin desactivado.");
    const body = request.body as { identifier?: string };
    return autoLogin(body?.identifier);
  });

  app.post("/auth/refresh", async (request) => {
    const body = request.body as { refreshToken: string };
    return { accessToken: await refresh(body.refreshToken) };
  });

  app.post("/auth/remember", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const rememberToken = jwt.sign(
      { userId: request.user.id, type: "remember" },
      env.JWT_ACCESS_SECRET,
      { expiresIn: "30d" as SignOptions["expiresIn"] }
    );
    return { rememberToken };
  });

  app.post("/auth/auto-login-remember", async (request, reply) => {
    const body = request.body as { rememberToken: string };
    let payload: { userId: string; type: string };
    try {
      payload = jwt.verify(body.rememberToken, env.JWT_ACCESS_SECRET) as { userId: string; type: string };
    } catch {
      return reply.unauthorized("Token de sesión inválido o expirado.");
    }
    if (payload.type !== "remember") return reply.unauthorized();
    const session = await issueSession(payload.userId);
    return reply.send(session);
  });

  app.post("/auth/logout", async (request) => {
    const body = request.body as { refreshToken?: string };
    if (body.refreshToken) await revokeRefreshToken(body.refreshToken);
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    return { user: await buildUserSession(request.user.id) };
  });

  app.post("/auth/change-password", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const input = changePasswordSchema.parse(request.body);
    return changePassword(request.user.id, input.currentPassword, input.newPassword);
  });

  app.put("/auth/profile", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const input = profileUpdateSchema.parse(request.body);
    await prisma.user.update({
      where: { id: request.user.id },
      data: { profileColor: input.profileColor }
    });
    return { user: await buildUserSession(request.user.id) };
  });

  app.put("/auth/notification-email", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const body = request.body as { notificationEmail: string | null };
    const value = body?.notificationEmail?.trim() || null;
    if (value !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return reply.badRequest("Email no válido.");
    }
    await prisma.user.update({
      where: { id: request.user.id },
      data: { notificationEmail: value }
    });
    return { user: await buildUserSession(request.user.id) };
  });

  app.post("/auth/avatar", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const file = await request.file();
    if (!file) return reply.badRequest("Falta la imagen.");
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return reply.badRequest("Formato de imagen no permitido.");
    }

    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : file.mimetype === "image/gif" ? "gif" : "jpg";
    const avatarDir = path.resolve(env.UPLOAD_DIR, "avatars");
    await mkdir(avatarDir, { recursive: true });
    const filename = `${request.user.id}-${Date.now()}.${ext}`;
    await pipeline(file.file, createWriteStream(path.join(avatarDir, filename)));
    const avatarUrl = `/uploads/avatars/${filename}`;
    await prisma.user.update({ where: { id: request.user.id }, data: { avatarUrl } });
    return { user: await buildUserSession(request.user.id) };
  });

  app.delete("/auth/avatar", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    await prisma.user.update({ where: { id: request.user.id }, data: { avatarUrl: null } });
    return { user: await buildUserSession(request.user.id) };
  });

  app.post("/auth/2fa/complete", async (request, reply) => {
    const body = request.body as { tempToken: string; token: string };
    let payload: { userId: string; temp: boolean };
    try {
      payload = jwt.verify(body.tempToken, env.JWT_ACCESS_SECRET) as { userId: string; temp: boolean };
    } catch {
      return reply.unauthorized("Token de verificación inválido o expirado.");
    }
    if (!payload.temp) return reply.unauthorized();
    const valid = await verify2FA(payload.userId, body.token);
    if (!valid) return reply.code(403).send({ message: "Código 2FA incorrecto." });
    const session = await issueSession(payload.userId);
    return reply.send(session);
  });

  app.get("/auth/2fa/status", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    return get2FAStatus(request.user.id);
  });

  app.post("/auth/2fa/setup", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    return setup2FA(request.user.id);
  });

  app.post("/auth/2fa/enable", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const body = request.body as { secret: string; token: string };
    return enable2FA(request.user.id, body.secret, body.token);
  });

  app.post("/auth/2fa/disable", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const body = request.body as { password: string };
    return disable2FA(request.user.id, body.password);
  });

  app.post("/auth/2fa/recovery-codes", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const body = request.body as { password: string };
    return regenerateRecoveryCodes(request.user.id, body.password);
  });
}
