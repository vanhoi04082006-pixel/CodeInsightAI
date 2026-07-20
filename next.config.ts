import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel handles output automatically — don't use "standalone".
  // For self-hosted Docker, uncomment: output: "standalone"
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Packages that must be loaded from node_modules rather than bundled
  // into the serverless function. Prisma needs this to resolve its
  // generated engine binaries at runtime.
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
