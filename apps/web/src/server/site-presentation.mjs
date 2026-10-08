function cleanText(value) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
  return normalized || null
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

function extractTagContent(html, pattern) {
  const match = html.match(pattern)
  return cleanText(decodeHtml(match?.[1] ?? ""))
}

function extractMetaContent(html, attribute, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const patterns = [
    new RegExp(`<meta[^>]*${attribute}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attribute}=["']${escaped}["'][^>]*>`, "i"),
  ]
  for (const pattern of patterns) {
    const result = extractTagContent(html, pattern)
    if (result) return result
  }
  return null
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "SERP-DR/1.0 (+https://dr.serp.co)",
      accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    throw new Error(`Fetch failed with ${response.status}`)
  }

  return {
    finalUrl: response.url || url,
    html: await response.text(),
  }
}

async function fetchDirectMetadata(domain) {
  let lastError = null

  for (const protocol of ["https", "http"]) {
    try {
      const direct = await fetchHtml(`${protocol}://${domain}`)
      const title =
        extractTagContent(direct.html, /<title[^>]*>([^<]+)<\/title>/i) ||
        extractMetaContent(direct.html, "property", "og:title") ||
        extractMetaContent(direct.html, "name", "twitter:title")
      const description =
        extractMetaContent(direct.html, "name", "description") ||
        extractMetaContent(direct.html, "property", "og:description") ||
        extractMetaContent(direct.html, "name", "twitter:description")

      if (!title && !description) {
        throw new Error("Missing title and description in direct fetch")
      }

      return {
        siteTitle: title,
        metaDescription: description,
        siteUrl: cleanText(direct.finalUrl),
        screenshotUrl: null,
        source: "direct",
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error("Direct metadata fetch failed")
}

async function fetchMicrolinkMetadata(domain) {
  const url = new URL("https://api.microlink.io")
  url.searchParams.set("url", `https://${domain}`)
  url.searchParams.set("screenshot", "true")

  const response = await fetch(String(url), {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`Microlink failed with ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.status !== "success" || !payload?.data) {
    throw new Error("Microlink returned an invalid payload")
  }

  return {
    siteTitle: cleanText(payload.data.title),
    metaDescription: cleanText(payload.data.description),
    siteUrl: cleanText(payload.data.url),
    screenshotUrl: cleanText(payload.data.screenshot?.url),
    source: "microlink",
  }
}

export async function resolveSitePresentation(domain) {
  try {
    return await fetchMicrolinkMetadata(domain)
  } catch {
    return await fetchDirectMetadata(domain)
  }
}
