"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { upsertSiteHistory } from "@/lib/site-history"

export function ClaimClient({ domain }: { domain: string }) {
  const [status, setStatus] = useState<"idle" | "claimed" | "error" | "upgrade">("idle")
  const [message, setMessage] = useState<string | null>(null)

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
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          if (payload?.code === "upgrade_required") {
            setMessage(typeof payload?.error === "string" ? payload.error : "Upgrade required to claim domains.")
            setStatus("upgrade")
            return
          }
          throw new Error(typeof payload?.error === "string" ? payload.error : "Claim failed")
        }
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
      {status === "claimed"
        ? "Claimed via email"
        : status === "upgrade"
          ? (
              <>
                {message || "Upgrade required to claim domains."}{" "}
                <Link href="/pricing" className="underline underline-offset-2">
                  Upgrade
                </Link>
              </>
            )
          : "Could not claim this domain to your email."}
    </p>
  )
}
