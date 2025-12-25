"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"

export function EmbedCard({
  pageUrl,
  badgeUrl,
  domain,
}: {
  pageUrl: string
  badgeUrl: string
  domain: string
}) {
  const [copied, setCopied] = useState(false)

  const snippet = useMemo(() => {
    return `<a href="${pageUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeUrl}" alt="Verified DR for ${domain}" width="200" height="50"></a>`
  }, [badgeUrl, domain, pageUrl])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
        <pre>{snippet}</pre>
      </div>
      <Button type="button" variant="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy embed code"}
      </Button>
    </div>
  )
}
