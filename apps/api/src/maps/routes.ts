import type { FastifyInstance } from "fastify";
import { MockMapsProvider } from "./provider.js";

const provider = new MockMapsProvider();

export async function mapRoutes(app: FastifyInstance) {
  app.get("/places/search", async (request, reply) => {
    if (!request.user) return reply.unauthorized();
    const { q } = request.query as { q?: string };
    return provider.search(q ?? "");
  });
}
