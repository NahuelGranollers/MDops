import type { FastifyRequest } from "fastify";

// Estructura segura del usuario autenticado en la sesión
export type AuthUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
};

// Extensión del tipo nativo de Fastify para incluir al usuario en la petición (req.user)
export type AuthedRequest = FastifyRequest & { user: AuthUser };
