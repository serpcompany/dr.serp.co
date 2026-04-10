"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

type BillingPortalButtonProps = {
  email: string
  label?: string
}

export function BillingPortalButton({
  email,
  label = "Manage billing",
}: BillingPortalButtonProps) {
  const [loading, setLoading] = useState(false)

  const openPortal = async () => {
    if (!email) return
    setLoading(true)

    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to open billing portal.")
      }
      if (!payload?.url) {
        throw new Error("Billing portal URL not returned.")
      }
      window.location.href = payload.url
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open billing portal.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button type="button" disabled={loading} onClick={openPortal}>
      {loading ? "Opening..." : label}
    </Button>
  )
}
