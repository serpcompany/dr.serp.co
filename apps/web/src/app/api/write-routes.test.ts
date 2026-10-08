// Every write route refuses a foreign Origin (403, browser routes only), an oversized body (413)
// and a body that isn't JSON (400) before it does any work. A source check keeps new write
// routes on readWriteRequest.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MAX_WRITE_BODY_BYTES } from "@/server/write-route"

type Handler = (request: Request) => Promise<Response>
type Route = { name: string; method: "POST" | "DELETE"; path: string; load: () => Promise<Handler>; admin?: boolean }

const ROUTES: Route[] = [
  { name: "claim", method: "POST", path: "/api/claims", load: async () => (await import("./claims/route")).POST },
  { name: "unclaim", method: "DELETE", path: "/api/claims", load: async () => (await import("./claims/route")).DELETE },
  { name: "recheck", method: "POST", path: "/api/recheck", load: async () => (await import("./recheck/route")).POST },
  { name: "my sites", method: "POST", path: "/api/my-sites", load: async () => (await import("./my-sites/route")).POST },
  {
    name: "billing status",
    method: "POST",
    path: "/api/billing/status",
    load: async () => (await import("./billing/status/route")).POST,
  },
  {
    name: "checkout",
    method: "POST",
    path: "/api/stripe/checkout",
    load: async () => (await import("./stripe/checkout/route")).POST,
  },
  { name: "portal", method: "POST", path: "/api/stripe/portal", load: async () => (await import("./stripe/portal/route")).POST },
  {
    name: "change plan",
    method: "POST",
    path: "/api/stripe/change-plan",
    load: async () => (await import("./stripe/change-plan/route")).POST,
  },
  {
    name: "request a code",
    method: "POST",
    path: "/api/auth/request-otp",
    load: async () => (await import("./auth/request-otp/route")).POST,
  },
  {
    name: "verify a code",
    method: "POST",
    path: "/api/auth/verify-otp",
    load: async () => (await import("./auth/verify-otp/route")).POST,
  },
  {
    name: "sign out",
    method: "DELETE",
    path: "/api/auth/session",
    load: async () => (await import("./auth/session/route")).DELETE as Handler,
  },
  {
    name: "admin prune audit",
    method: "POST",
    path: "/api/admin/billing/prune-audit",
    load: async () => (await import("./admin/billing/prune-audit/route")).POST,
    admin: true,
  },
  {
    name: "admin backfill metadata",
    method: "POST",
    path: "/api/admin/sites/backfill-metadata",
    load: async () => (await import("./admin/sites/backfill-metadata/route")).POST,
    admin: true,
  },
  {
    name: "admin cleanup",
    method: "POST",
    path: "/api/admin/sites/cleanup-invalid",
    load: async () => (await import("./admin/sites/cleanup-invalid/route")).POST,
    admin: true,
  },
]

function request(route: Route, body: BodyInit, origin = "https://dr.serp.co") {
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: origin }
  if (route.admin) headers["x-admin-token"] = "admin-secret"
  return new Request(`https://dr.serp.co${route.path}`, { method: route.method, headers, body })
}

describe("write routes", () => {
  beforeEach(() => {
    vi.stubEnv("DR_PUBLIC_BASE_URL", "https://dr.serp.co")
    vi.stubEnv("DR_ADMIN_TOKEN", "admin-secret")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  for (const route of ROUTES.filter((candidate) => !candidate.admin)) {
    it(`${route.name}: refuses a foreign Origin with 403`, async () => {
      const response = await (await route.load())(request(route, "{}", "https://evil.serp.co"))
      expect(response.status).toBe(403)
    })
  }

  for (const route of ROUTES) {
    it(`${route.name}: refuses an oversized body with 413`, async () => {
      const big = JSON.stringify({ padding: "a".repeat(MAX_WRITE_BODY_BYTES) })
      const response = await (await route.load())(request(route, big))
      expect(response.status).toBe(413)
    })

    it(`${route.name}: refuses a body that isn't JSON with 400`, async () => {
      const response = await (await route.load())(request(route, "{not json"))
      expect(response.status).toBe(400)
    })

    it(`${route.name}: refuses JSON that fails its schema with 400`, async () => {
      const response = await (await route.load())(request(route, "[]"))
      expect(response.status).toBe(400)
    })
  }

  it("covers every route file that handles a write, and each one uses readWriteRequest", () => {
    const apiDir = path.join(process.cwd(), "src/app/api")
    const routeFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const file = path.join(dir, name)
        if (statSync(file).isDirectory()) return routeFiles(file)
        return name === "route.ts" ? [file] : []
      })

    const writeRoutes = routeFiles(apiDir)
      .filter((file) => /export async function (POST|PUT|PATCH|DELETE)\b/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(apiDir, path.dirname(file)))
      // Stripe signs its webhook; the signature check replaces the Origin check and schema.
      .filter((dir) => dir !== path.join("stripe", "webhook"))

    for (const dir of writeRoutes) {
      expect(readFileSync(path.join(apiDir, dir, "route.ts"), "utf8"), dir).toContain("readWriteRequest(")
    }
    const covered = new Set(ROUTES.map((route) => route.path.replace(/^\/api\//, "")))
    expect(writeRoutes.filter((dir) => !covered.has(dir.split(path.sep).join("/")))).toEqual([])
  })
})
