import type { NextConfig } from "next";

const env = process.env as Record<string, string | undefined>;
const isStaticExport = env.STATIC_EXPORT === "true";
const basePath = env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : (env.NEXT_STANDALONE === "true" ? "standalone" : undefined),
  basePath: basePath || undefined,
  images: {
    unoptimized: true,
  },
  // ─── DESACTIVAR CACHÉ DE WEBPACK PARA EVITAR EL BUG EISDIR EN WINDOWS ───
  webpack: (config) => {
    config.cache = false; // Fuerza a Webpack a compilar limpio en memoria RAM
    return config;
  },
  
  // ─── REWRITES CONDICIONALES PARA EVITAR ERRORES EN EXPORTACIONES ESTÁTICAS ───
  // Solo se inyecta la función rewrites si NO es una exportación estática (GitHub Pages)
  ...(!isStaticExport && {
    async rewrites() {
      const api = env.INTERNAL_API_URL ?? "http://127.0.0.1:4000";
      return [
        { source: "/api/:path*", destination: `${api}/api/:path*` },
        { source: "/uploads/:path*", destination: `${api}/uploads/:path*` }
      ];
    }
  })
};

export default nextConfig;
