'use client'

import { Copy } from 'lucide-react'
import { useMemo } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

type BadgeEmbedProps = {
  domain: string
  dr: number | null
  linkUrl: string
  badgeUrl: string
}

function getBadgeLabel(dr: number | null) {
  return typeof dr === 'number' && Number.isFinite(dr)
    ? Math.max(0, Math.min(100, Math.floor(dr)))
    : null
}

export function getBadgeEmbedCode({ domain, dr, linkUrl, badgeUrl }: BadgeEmbedProps) {
  const label = getBadgeLabel(dr)
  const alt =
    label === null ? `Verified DR unavailable for ${domain}` : `Verified DR ${label} for ${domain}`
  return `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeUrl}" alt="${alt}" width="200" height="50"></a>`
}

export function BadgeEmbed({ domain, dr, linkUrl, badgeUrl }: BadgeEmbedProps) {
  const label = getBadgeLabel(dr)

  const badgeEmbedCode = useMemo(() => {
    return getBadgeEmbedCode({ domain, dr, linkUrl, badgeUrl })
  }, [badgeUrl, domain, dr, linkUrl])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(badgeEmbedCode)
      toast.success('Badge embed code copied to clipboard!')
    } catch {
      toast.error('Failed to copy embed code')
    }
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <Button
        type="button"
        variant="ghost"
        onClick={handleCopy}
        className="group relative h-auto p-0 hover:bg-transparent"
        aria-label="Copy badge embed code"
      >
        {/* biome-ignore lint/performance/noImgElement: the badge is an SVG the badge route serves */}
        <img
          src={badgeUrl}
          alt={
            label === null
              ? `Verified DR unavailable for ${domain}`
              : `Verified DR ${label} for ${domain}`
          }
          width={200}
          height={50}
        />
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-foreground/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Copy className="size-6 text-background" />
        </div>
      </Button>
      <p className="text-sm text-muted-foreground">Click badge to copy embed code</p>
    </div>
  )
}
