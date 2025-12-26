"use client"

import { useMemo } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "sonner"

export function BadgeEmbed({
  domain,
  dr,
  linkUrl,
  badgeUrl,
}: {
  domain: string
  dr: number | null
  linkUrl: string
  badgeUrl: string
}) {
  const badgeEmbedCode = useMemo(() => {
    const safeLinkUrl = linkUrl.endsWith("/") ? linkUrl : `${linkUrl}/`
    const label = typeof dr === "number" && Number.isFinite(dr) ? Math.max(0, Math.min(100, Math.floor(dr))) : null
    const alt = label === null ? `Verified DR for ${domain}` : `Verified DR ${label} for ${domain}`
    return `<a href="${safeLinkUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeUrl}" alt="${alt}" width="200" height="50"></a>`
  }, [badgeUrl, domain, dr, linkUrl])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(badgeEmbedCode)
      toast.success("Badge embed code copied to clipboard!")
    } catch {
      toast.error("Failed to copy embed code")
    }
  }

  const label = typeof dr === "number" && Number.isFinite(dr) ? Math.max(0, Math.min(100, Math.floor(dr))) : null

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleCopy}
        className="group relative transition-transform hover:scale-[1.02] active:scale-[0.99]"
        aria-label="Copy badge embed code"
        type="button"
      >
        <div className="flex items-center gap-3 rounded-lg border-2 border-emerald-600 bg-background px-4 py-2.5 shadow-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600">
            <Check className="h-5 w-5 text-white" strokeWidth={3} />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-foreground">VERIFIED DR</span>
            <span className="text-muted-foreground">|</span>
            <span className="tabular-nums text-muted-foreground">{label === null ? "—" : label}</span>
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Copy className="h-6 w-6 text-white" />
        </div>
      </button>
      <p className="text-sm text-muted-foreground">Click badge to copy embed code</p>
    </div>
  )
}
