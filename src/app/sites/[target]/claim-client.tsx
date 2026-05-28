"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { upsertSiteHistory } from "@/lib/site-history"

type Entitlement = {
  canClaim?: boolean
}

export function ClaimClient({ domain, claimEmail = null }: { domain: string; claimEmail?: string | null }) {
  const [status, setStatus] = useState<"idle" | "claimed" | "error" | "upgrade">("idle")
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const email = window.localStorage.getItem("dr-auth-email")?.trim().toLowerCase()
    if (!email) return

    upsertSiteHistory(email, { domain })
    if (claimEmail?.trim().toLowerCase() === email) {
      setStatus("claimed")
      return
    }

    const controller = new AbortController()
    ;(async () => {
      try {
        const entitlementResponse = await fetch("/api/billing/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          signal: controller.signal,
        })
        const entitlementPayload = await entitlementResponse.json().catch(() => ({}))
        if (!entitlementResponse.ok) {
          throw new Error(
            typeof entitlementPayload?.error === "string"
              ? entitlementPayload.error
              : "Unable to verify billing status."
          )
        }

        const entitlement = entitlementPayload?.entitlement as Entitlement | null
        if (!entitlement?.canClaim) {
          setMessage("Upgrade required to claim domains.")
          setStatus("upgrade")
          return
        }

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
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        setStatus("error")
      }
    })()

    return () => controller.abort()
  }, [claimEmail, domain])

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
