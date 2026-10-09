import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  // Lets the sandbox-only build be served from a sub-path, such as a demo
  // folder on another site.
  basePath: process.env.SANDBOX_BASE_PATH || undefined,
};

export default nextConfig;
