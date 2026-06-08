import type { FastifyRequest } from "fastify";

export type AuthUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

export type AuthedRequest = FastifyRequest & { user: AuthUser };
