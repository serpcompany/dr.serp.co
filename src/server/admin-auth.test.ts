import { afterEach, describe, expect, it, vi } from "vitest"

import { checkAdminToken } from "./admin-auth.mjs"

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers })
}

describe("checkAdminToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("accepts the token in the x-admin-token header", () => {
    vi.stubEnv("DR_ADMIN_TOKEN", "admin-secret")
    expect(checkAdminToken(request("http://localhost/api/admin", { "x-admin-token": "admin-secret" }))).toBeNull()
  })

  it("refuses the token in the query string", () => {
    vi.stubEnv("DR_ADMIN_TOKEN", "admin-secret")
    expect(checkAdminToken(request("http://localhost/api/admin?token=admin-secret"))).toEqual({
      status: 401,
      error: "Unauthorized.",
    })
  })

  it("refuses a wrong token of any length", () => {
    vi.stubEnv("DR_ADMIN_TOKEN", "admin-secret")
    for (const token of ["admin-secreT", "admin", "admin-secret-and-more", ""]) {
      expect(checkAdminToken(request("http://localhost/api/admin", { "x-admin-token": token }))?.status).toBe(401)
    }
  })

  it("answers 500 when no admin token is configured", () => {
    vi.stubEnv("DR_ADMIN_TOKEN", "")
    expect(checkAdminToken(request("http://localhost/api/admin", { "x-admin-token": "" }))?.status).toBe(500)
  })
})
