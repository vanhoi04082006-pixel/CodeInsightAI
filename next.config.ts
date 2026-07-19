import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel handles output automatically — don't use "standalone"
  // For self-hosted Docker, uncomment: output: "standalone"
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // External packages that need to be bundled for serverless
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Prisma needs to generate client on build
  experimental: {
    // Ensure Prisma client is available in serverless
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
