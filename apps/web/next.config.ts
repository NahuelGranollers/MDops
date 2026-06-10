import type { NextConfig } from "next";

declare const process: { env: { INTERNAL_API_URL?: string; NEXT_PUBLIC_BASE_PATH?: string; NEXT_STANDALONE?: string; STATIC_EXPORT?: string } };

const isStaticExport = process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : (process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined),
  basePath: basePath || undefined,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (isStaticExport) return [];
    
    const api = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4000";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/uploads/:path*", destination: `${api}/uploads/:path*` }
    ];
  }
};

export default nextConfig;
