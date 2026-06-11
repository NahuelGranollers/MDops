import type { NextConfig } from "next";

const env = process.env as Record<string, string | undefined>;
const isStaticExport = env.STATIC_EXPORT === "true";
const basePath = env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  webpack: (config) => {
    config.cache = false;
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
