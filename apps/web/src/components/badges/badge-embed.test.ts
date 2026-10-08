import { describe, expect, it } from "vitest"

import { getBadgeEmbedCode } from "./badge-embed"

describe("getBadgeEmbedCode", () => {
  it("links to the exact site profile URL", () => {
    const html = getBadgeEmbedCode({
      domain: "example.com",
      dr: 42.9,
      linkUrl: "https://dr.serp.co/sites/example.com",
      badgeUrl: "https://dr.serp.co/badge/example.com?style=serp-dr-v3",
    })

    expect(html).toBe(
      '<a href="https://dr.serp.co/sites/example.com" target="_blank" rel="noopener noreferrer"><img src="https://dr.serp.co/badge/example.com?style=serp-dr-v3" alt="Verified DR 42 for example.com" width="200" height="50"></a>'
    )
    expect(html).not.toContain('href="https://dr.serp.co/"')
  })
})
