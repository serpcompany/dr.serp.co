import { describe, expect, it } from "vitest"

import { normalizeTarget } from "./domain-target.mjs"

describe("normalizeTarget", () => {
  it("rejects known junk entries that should never appear in /sites", () => {
    const invalidTargets = [
      "phpinfo.php",
      "wp-login.php",
      "xmlrpc.php",
      "wp-json",
      "contact",
      "demo",
      "pricing",
      "ftp-config.json",
      "get-in-touch",
      "help",
      ".env.production",
      ".env.save",
      ".remote",
      "backup.sql",
      ".env",
      "support",
      ".env.sample",
      "wp",
      ".env.local",
      "wordpress",
      "database.sql",
    ]

    for (const target of invalidTargets) {
      expect(normalizeTarget(target)).toBeNull()
    }
  })

  it("accepts real domains", () => {
    expect(normalizeTarget("onlyfansvideodownloader.com")).toBe("onlyfansvideodownloader.com")
    expect(normalizeTarget("https://www.example.com/path?q=1")).toBe("example.com")
  })
})
