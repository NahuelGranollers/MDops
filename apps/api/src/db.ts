import { PrismaClient, type Prisma } from "@prisma/client";
import { env } from "./config/env.js";
import { logSession } from "./session-log.js";

function createPrismaClient() {
  if (!env.DATABASE_URL) {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "$on" || prop === "$use" || prop === "$connect" || prop === "$disconnect") {
            return () => undefined;
          }
          throw new Error(`DATABASE_URL is not configured. Prisma client is unavailable for ${String(prop)}.`);
        }
      }
    ) as PrismaClient;
  }

  const prisma = new PrismaClient({
    log: [{ emit: "event", level: "error" }, { emit: "event", level: "warn" }]
  });

  prisma.$on("error", (event: Prisma.LogEvent) => {
    logSession({ type: "prisma_error", message: event.message, data: { target: event.target } });
  });

  prisma.$on("warn", (event: Prisma.LogEvent) => {
    logSession({ type: "prisma_warn", message: event.message, data: { target: event.target } });
  });

  return prisma;
}

export const prisma = createPrismaClient();
