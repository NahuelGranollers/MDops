import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { changePasswordSchema, loginSchema, profileUpdateSchema } from "@md-ops/shared";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { autoLogin, buildUserSession, changePassword, getAutoLoginStatus, login, refresh, revokeRefreshToken } from "./service.js";
import { prisma } from "../db.js";

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
    return reply.send(result);
  });

  app.get("/auth/autologin", async () => getAutoLoginStatus());

  app.post("/auth/autologin", async (_request, reply) => {
    const status = getAutoLoginStatus();
    if (!status.enabled) return reply.notFound("Autologin desactivado.");
    return autoLogin();
  });

  app.post("/auth/refresh", async (request) => {
    const body = request.body as { refreshToken: string };
    return { accessToken: await refresh(body.refreshToken) };
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
}
