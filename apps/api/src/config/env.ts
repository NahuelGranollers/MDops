import { z } from "zod";

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}, z.string().optional());

const booleanString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "on", "si", "sí"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(24).default("dev_access_secret_change_me_please"),
  JWT_REFRESH_SECRET: z.string().min(24).default("dev_refresh_secret_change_me_please"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DEFAULT_TIMEZONE: z.string().default("Europe/Madrid"),
  MIN_REST_HOURS: z.coerce.number().default(10),
  REST_CONFLICT_MODE: z.enum(["warn", "block"]).default("warn"),
  UPLOAD_DIR: z.string().default("./uploads"),
  SESSION_LOG_DIR: z.string().default("./logs"),
  SESSION_LOG_SLOW_MS: z.coerce.number().default(1500),
  MAX_UPLOAD_MB: z.coerce.number().default(25),
  MAPS_PROVIDER: z.enum(["mock", "google"]).default("mock"),
  GOOGLE_MAPS_API_KEY: optionalString,
  EMAIL_NOTIFICATIONS_ENABLED: booleanString.default(true),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,
  SMTP_FROM_NAME: z.string().default("MD Ops"),
  SMTP_REPLY_TO: optionalString,
  AUTOLOGIN_ENABLED: booleanString.default(true),
  AUTOLOGIN_IDENTIFIER: optionalString,
  AUTOLOGIN_ALLOW_PRODUCTION: booleanString.default(false),
  SUPABASE_URL: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString
});

export const env = schema.parse(process.env);
