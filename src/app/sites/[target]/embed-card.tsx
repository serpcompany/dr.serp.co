"use client"

import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function EmbedCard({
  linkUrl,
  badgeUrl,
  domain,
}: {
  linkUrl: string
  badgeUrl: string
  domain: string
}) {
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const snippet = useMemo(() => {
    const safeLinkUrl = linkUrl.endsWith("/") ? linkUrl : `${linkUrl}/`
    return `<a href="${safeLinkUrl}" target="_blank" rel="noopener noreferrer"><img src="${badgeUrl}" alt="Verified DR for ${domain}" width="200" height="50"></a>`
  }, [badgeUrl, domain, linkUrl])

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
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium">Embed this badge</p>
        <p className="text-xs text-muted-foreground">Copy/paste the HTML into your site.</p>
      </div>

      <Textarea
        ref={textareaRef}
        readOnly
        value={snippet}
        rows={3}
        className="bg-muted/30 font-mono text-xs leading-relaxed"
        onFocus={() => textareaRef.current?.select()}
        aria-label="Badge embed HTML"
      />

      <div className="flex justify-center">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy embed code"}
        </Button>
      </div>
    </div>
  )
}
