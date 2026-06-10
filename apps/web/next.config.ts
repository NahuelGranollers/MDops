import type { NextConfig } from "next";

// Forzamos un tipado dinámico y seguro local para evadir bloqueos de tipos globales externos
const env = process.env as Record<string, string | undefined>;

const isStaticExport = env.STATIC_EXPORT === "true";
const basePath = env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : (env.NEXT_STANDALONE === "true" ? "standalone" : undefined),
  basePath: basePath || undefined,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (isStaticExport) return [];
    
    const api = env.INTERNAL_API_URL ?? "http://127.0.0.1:4000";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/uploads/:path*", destination: `${api}/uploads/:path*` }
    ];
  }
};

export default nextConfig;
