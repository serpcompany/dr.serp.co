import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
};

// Local values live in .dev.vars, never in .env* files: the OpenNext build copies every .env*
// file into the Worker bundle. `next dev` reads .dev.vars here; builds never do.
function loadDevVars() {
  if (!existsSync(".dev.vars")) return;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(".dev.vars", "utf8")))) {
    process.env[key] ??= value;
  }
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) loadDevVars();
  return nextConfig;
}
