"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"

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
      toast.success("Embed code copied")
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-3 text-center">
      <textarea readOnly value={snippet} className="sr-only" aria-hidden />
      <Button type="button" variant="secondary" onClick={copy} className="mx-auto">
        {copied ? "Copied" : "Copy embed code"}
      </Button>
    </div>
  )
}
