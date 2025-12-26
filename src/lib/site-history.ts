export type SiteRow = {
  domain: string
  domain_rating: number | null
  updated_at: string | null
}

const STORAGE_PREFIX = "dr-my-sites:"

function storageKey(email: string) {
  return `${STORAGE_PREFIX}${email.trim().toLowerCase()}`
}

function safeIso(value: unknown) {
  if (typeof value !== "string") return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function safeDomain(value: unknown) {
  const domain = String(value ?? "").trim().toLowerCase()
  return domain ? domain : null
}

function safeDr(value: unknown) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const dr = Math.max(0, Math.min(100, Math.floor(n)))
  return Number.isFinite(dr) ? dr : null
}

export function readSiteHistory(email: string): SiteRow[] {
  if (typeof window === "undefined") return []
  const key = storageKey(email)
  const raw = window.localStorage.getItem(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const rows: SiteRow[] = []
    for (const item of parsed) {
      const domain = safeDomain((item as any)?.domain)
      if (!domain) continue
      rows.push({
        domain,
        domain_rating: safeDr((item as any)?.domain_rating),
        updated_at: safeIso((item as any)?.updated_at),
      })
    }
    return rows
  } catch {
    return []
  }
}

export function upsertSiteHistory(email: string, site: Partial<SiteRow> & { domain: string }) {
  if (typeof window === "undefined") return
  const key = storageKey(email)

  const domain = safeDomain(site.domain)
  if (!domain) return

  const nowIso = new Date().toISOString()
  const next: SiteRow = {
    domain,
    domain_rating: safeDr((site as any).domain_rating),
    updated_at: safeIso((site as any).updated_at) || nowIso,
  }

  const existing = readSiteHistory(email)
  const mergedByDomain = new Map<string, SiteRow>()

  for (const row of existing) mergedByDomain.set(row.domain, row)

  const prev = mergedByDomain.get(domain)
  if (prev) {
    mergedByDomain.set(domain, {
      domain,
      domain_rating: next.domain_rating ?? prev.domain_rating ?? null,
      updated_at: next.updated_at ?? prev.updated_at ?? nowIso,
    })
  } else {
    mergedByDomain.set(domain, next)
  }

  const rows = Array.from(mergedByDomain.values()).sort((a, b) => {
    const at = a.updated_at ? Date.parse(a.updated_at) : -Infinity
    const bt = b.updated_at ? Date.parse(b.updated_at) : -Infinity
    if (bt !== at) return bt - at
    return a.domain.localeCompare(b.domain)
  })

  window.localStorage.setItem(key, JSON.stringify(rows.slice(0, 100)))
}

export function filterSiteHistory(email: string, query: string) {
  const q = query.trim().toLowerCase()
  const rows = readSiteHistory(email)
  return q ? rows.filter((row) => row.domain.includes(q)) : rows
}

