"use client"

import { useMemo } from "react"
import { Copy } from "lucide-react"
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
  const label = typeof dr === "number" && Number.isFinite(dr) ? Math.max(0, Math.min(100, Math.floor(dr))) : 0

  const badgeEmbedCode = useMemo(() => {
    const safeLinkUrl = linkUrl.endsWith("/") ? linkUrl : `${linkUrl}/`
    const alt = `Verified DR ${label} for ${domain}`
    return `<a href="${safeLinkUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeUrl}" alt="${alt}" width="200" height="50"></a>`
  }, [badgeUrl, domain, label, linkUrl])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(badgeEmbedCode)
      toast.success("Badge embed code copied to clipboard!")
    } catch {
      toast.error("Failed to copy embed code")
    }
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={handleCopy}
        className="group relative transition-transform hover:scale-105 active:scale-95"
        aria-label="Copy badge embed code"
        type="button"
      >
        <img
          src={badgeUrl}
          alt={`Verified DR ${label} for ${domain}`}
          width={200}
          height={50}
        />
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-foreground/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Copy className="h-6 w-6 text-background" />
        </div>
      </button>
      <p className="text-sm text-muted-foreground">Click badge to copy embed code</p>
    </div>
  )
}
