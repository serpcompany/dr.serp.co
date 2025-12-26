"use client"

import { useEffect, useState } from "react"

import { upsertSiteHistory } from "@/lib/site-history"

export function ClaimClient({ domain }: { domain: string }) {
  const [status, setStatus] = useState<"idle" | "claimed" | "error">("idle")

  useEffect(() => {
    const email = window.localStorage.getItem("dr-auth-email")?.trim().toLowerCase()
    if (!email) return

    upsertSiteHistory(email, { domain })

    const controller = new AbortController()
    ;(async () => {
      try {
        const response = await fetch("/api/claims", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, domain }),
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("claim failed")
        setStatus("claimed")
        upsertSiteHistory(email, { domain })
      } catch {
        setStatus("error")
      }
    })()

    return () => controller.abort()
  }, [domain])

  if (status === "idle") return null

  return (
    <p className="text-xs text-muted-foreground">
      {status === "claimed" ? "Claimed via email" : "Could not claim this domain to your email."}
    </p>
  )
}
