import { PrismaClient } from "@prisma/client";
import { logSession } from "./session-log.js";

export const prisma = new PrismaClient({
  log: [{ emit: "event", level: "error" }, { emit: "event", level: "warn" }]
});

prisma.$on("error", (event) => {
  logSession({ type: "prisma_error", message: event.message, data: { target: event.target } });
});

prisma.$on("warn", (event) => {
  logSession({ type: "prisma_warn", message: event.message, data: { target: event.target } });
});
