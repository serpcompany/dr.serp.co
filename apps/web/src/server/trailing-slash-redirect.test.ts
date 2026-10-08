import { describe, expect, it } from "vitest"

import { redirectTrailingSlash } from "./trailing-slash-redirect.mjs"

describe("redirectTrailingSlash", () => {
  it("redirects trailing slash requests to the slashless path", async () => {
    const response = redirectTrailingSlash(new Request("https://dr.serp.co/api/sites/?limit=1"))

    expect(response?.status).toBe(308)
    expect(response?.headers.get("location")).toBe("/api/sites?limit=1")
    expect(response?.headers.get("content-type")).toBe("text/plain")
    expect(response?.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate")
    await expect(response?.text()).resolves.toBe("Redirecting...\n")
  })

  it("passes through root, slashless, and Next asset requests", () => {
    expect(redirectTrailingSlash(new Request("https://dr.serp.co/"))).toBeNull()
    expect(redirectTrailingSlash(new Request("https://dr.serp.co/api/sites"))).toBeNull()
    expect(redirectTrailingSlash(new Request("https://dr.serp.co/_next/static/chunk.js/"))).toBeNull()
  })
})
