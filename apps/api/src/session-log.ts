import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { env } from "./config/env.js";

const startedAt = new Date();
const sessionId = randomUUID();
const logDir = path.resolve(env.SESSION_LOG_DIR);
const logFile = path.join(
  logDir,
  `session-${startedAt.toISOString().replace(/[:.]/g, "-")}-${sessionId.slice(0, 8)}.jsonl`
);

let ready = mkdir(logDir, { recursive: true }).catch((error) => {
  console.error(`No se ha podido preparar SESSION_LOG_DIR: ${error instanceof Error ? error.message : String(error)}`);
});

type SessionLogEntry = {
  type: string;
  tenantId?: string | null;
  actorId?: string | null;
  requestId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  durationMs?: number;
  message?: string;
  data?: unknown;
};

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack };
    return item;
  }));
}

export function getSessionLogInfo() {
  return { sessionId, startedAt, logFile };
}

export function logSession(entry: SessionLogEntry) {
  const payload = {
    sessionId,
    timestamp: new Date().toISOString(),
    ...entry
  };

  ready = ready
    .then(() => appendFile(logFile, `${JSON.stringify(jsonSafe(payload))}\n`, "utf8"))
    .catch((error) => {
      console.error(`No se ha podido escribir el log de sesion: ${error instanceof Error ? error.message : String(error)}`);
    });
}

logSession({
  type: "session_start",
  message: "MD Ops API session started",
  data: {
    nodeEnv: env.NODE_ENV,
    apiPort: env.API_PORT,
    uploadDir: env.UPLOAD_DIR
  }
});
