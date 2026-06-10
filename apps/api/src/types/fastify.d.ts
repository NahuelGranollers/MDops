import type { FastifyInstance, FastifyReply } from "fastify";
import type { FastifyErrorObject } from "@fastify/sensible";

declare module "fastify" {
  interface FastifyInstance {
    httpErrors: {
      [key: string]: FastifyErrorObject;
    };
  }

  interface FastifyReply {
    unauthorized(message?: string): FastifyReply;
    notFound(message?: string): FastifyReply;
    forbidden(message?: string): FastifyReply;
    badRequest(message?: string): FastifyReply;
    conflict(message?: string): FastifyReply;
    unprocessableEntity(message?: string): FastifyReply;
  }
}
