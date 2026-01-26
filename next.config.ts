import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Avoid bundling server-only deps into vendor chunks (prevents ENOENT vendor-chunk issues in dev).
  serverExternalPackages: ["@neondatabase/serverless"],
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
