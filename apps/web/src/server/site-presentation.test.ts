import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("resolveSitePresentation", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses Microlink on the first unresolved lookup", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          title: "Example Domain",
          description: "Example description",
          url: "https://example.com/",
          screenshot: { url: "https://cdn.microlink.io/example.png" },
        },
      }),
    })

    const { resolveSitePresentation } = await import("./site-presentation.mjs")
    const result = await resolveSitePresentation("example.com")

    expect(result).toMatchObject({
      siteTitle: "Example Domain",
      metaDescription: "Example description",
      siteUrl: "https://example.com/",
      screenshotUrl: "https://cdn.microlink.io/example.png",
      source: "microlink",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://api.microlink.io")
  })

  it("falls back to direct fetch when Microlink fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        url: "https://example.com/",
        text: vi.fn().mockResolvedValue(`<!doctype html>
          <html>
            <head>
              <title>Fallback Title</title>
              <meta name="description" content="Fallback description">
            </head>
          </html>`),
      })

    const { resolveSitePresentation } = await import("./site-presentation.mjs")
    const result = await resolveSitePresentation("example.com")

    expect(result).toMatchObject({
      siteTitle: "Fallback Title",
      metaDescription: "Fallback description",
      siteUrl: "https://example.com/",
      screenshotUrl: null,
      source: "direct",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://api.microlink.io")
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://example.com")
  })
})
