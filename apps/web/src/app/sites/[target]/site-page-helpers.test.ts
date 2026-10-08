import { describe, expect, it } from "vitest"

import {
  buildSitePageMetadata,
  getOutboundLinkProps,
  getPageSiteDescription,
  getPageSiteTitle,
} from "./site-page-helpers"

describe("site page helpers", () => {
  it("formats the SEO title as page title plus site name", () => {
    expect(
      buildSitePageMetadata({
        pageSiteTitle: "Browser Extensions IO",
        description: "A directory of browser extensions.",
      })
    ).toMatchObject({
      title: "Browser Extensions IO | SERP DR",
      description: "A directory of browser extensions.",
    })
  })

  it("uses the resolved site title when present", () => {
    expect(getPageSiteTitle({ siteTitle: "Example Domain", domain: "example.com" })).toBe("Example Domain")
  })

  it("falls back to a readable domain label when metadata title is missing", () => {
    expect(getPageSiteTitle({ siteTitle: null, domain: "example-site.io" })).toBe("Example Site IO")
  })

  it("returns the site description when present", () => {
    expect(getPageSiteDescription({ metaDescription: "Custom description", domain: "example.com" })).toBe(
      "Custom description"
    )
  })

  it("marks free links as nofollow and premium links as dofollow", () => {
    expect(getOutboundLinkProps(false)).toEqual({
      rel: "nofollow noopener noreferrer",
      target: "_blank",
    })
    expect(getOutboundLinkProps(true)).toEqual({
      rel: "noopener noreferrer",
      target: "_blank",
    })
  })
})
