import { generateSecret, verify } from "otplib";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";

function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(randomBytes(6).toString("hex").slice(0, 10).toUpperCase());
  }
  return codes;
}

export async function get2FAStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true }
  });
  return { enabled: user?.totpEnabled ?? false };
}

export async function setup2FA(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, totpEnabled: true }
  });
  if (user.totpEnabled) {
    throw new Error("2FA ya está activado.");
  }
  const secret = generateSecret();
  const otpauth = `otpauth://totp/MD%20Ops:${encodeURIComponent(user.email)}?secret=${secret}&issuer=MD%20Ops&algorithm=SHA1&digits=6&period=30`;
  const qrCode = await QRCode.toDataURL(otpauth);
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: secret }
  });
  return { secret, qrCode };
}

export async function verifySetupToken(userId: string, token: string) {
  if (!/^\d{6}$/.test(token)) {
    throw new Error("Código inválido. Debe tener 6 dígitos.");
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true }
  });
  if (user.totpEnabled) {
    throw new Error("2FA ya está activado.");
  }
  if (!user.totpSecret) {
    throw new Error("Primero genera un secreto con POST /auth/2fa/setup.");
  }
  const isValid = await verify({ token, secret: user.totpSecret });
  if (!isValid) {
    throw new Error("Código incorrecto.");
  }
  return { ok: true };
}

export async function enable2FA(userId: string, secret: string, token: string) {
  if (!/^\d{6}$/.test(token)) {
    throw new Error("Código inválido. Debe tener 6 dígitos.");
  }
  const isValid = await verify({ token, secret });
  if (!isValid) {
    throw new Error("Código incorrecto.");
  }
  const recoveryCodes = generateRecoveryCodes();
  const hashedCodes = await Promise.all(
    recoveryCodes.map((code) => bcrypt.hash(code, 10))
  );
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: secret,
      totpEnabled: true,
      recoveryCodes: JSON.stringify(hashedCodes)
    }
  });
  return { recoveryCodes };
}

export async function disable2FA(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true }
  });
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error("Contraseña incorrecta.");
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: null,
      totpEnabled: false,
      recoveryCodes: null
    }
  });
  return { ok: true };
}

export async function verify2FA(userId: string, token: string): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true, recoveryCodes: true }
  });
  if (!user.totpEnabled || !user.totpSecret) return true;
  if (await verify({ token, secret: user.totpSecret })) return true;
  const codes: string[] = user.recoveryCodes ? JSON.parse(user.recoveryCodes) : [];
  for (const hashed of codes) {
    if (await bcrypt.compare(token, hashed)) {
      const remaining = codes.filter((c) => c !== hashed);
      if (remaining.length > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { recoveryCodes: JSON.stringify(remaining) }
        });
      } else {
        await prisma.user.update({
          where: { id: userId },
          data: { recoveryCodes: null }
        });
      }
      return true;
    }
  }
  return false;
}

export async function sensitiveVerify(userId: string, token: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totpEnabled: true, totpSecret: true, recoveryCodes: true }
  });
  if (!user.totpEnabled) return { granted: true };
  if (!user.totpSecret) throw new Error("2FA no está configurado.");
  if (!/^\d{6}$/.test(token)) throw new Error("Código inválido.");
  const valid = await verify({ token, secret: user.totpSecret });
  if (valid) return { granted: true };
  const codes: string[] = user.recoveryCodes ? JSON.parse(user.recoveryCodes) : [];
  for (const hashed of codes) {
    if (await bcrypt.compare(token, hashed)) {
      const remaining = codes.filter((c) => c !== hashed);
      await prisma.user.update({
        where: { id: userId },
        data: { recoveryCodes: remaining.length > 0 ? JSON.stringify(remaining) : null }
      });
      return { granted: true };
    }
  }
  throw new Error("Código 2FA incorrecto.");
}

export async function regenerateRecoveryCodes(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true }
  });
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error("Contraseña incorrecta.");
  }
  const recoveryCodes = generateRecoveryCodes();
  const hashedCodes = await Promise.all(
    recoveryCodes.map((code) => bcrypt.hash(code, 10))
  );
  await prisma.user.update({
    where: { id: userId },
    data: { recoveryCodes: JSON.stringify(hashedCodes) }
  });
  return { recoveryCodes };
}
