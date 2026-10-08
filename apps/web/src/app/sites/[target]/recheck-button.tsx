"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { readJsonRecord } from "@/lib/read-json"

type RecheckButtonProps = {
  domain: string
  canRecheck?: boolean
  nextAllowedAt?: string | null
  intervalDays?: number
  tier?: "free" | "paid"
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function cadenceMessage({
  canRecheck,
  nextAllowedAt,
  intervalDays,
  tier,
}: Pick<RecheckButtonProps, "canRecheck" | "nextAllowedAt" | "intervalDays" | "tier">) {
  if (canRecheck !== false) return null
  const formatted = formatDate(nextAllowedAt)
  const plan = tier === "paid" ? "Paid" : "Free"
  const days = Number.isFinite(intervalDays) ? intervalDays : tier === "paid" ? 7 : 30
  return formatted ? `Next ${plan.toLowerCase()} recheck: ${formatted}` : `${plan} rechecks run every ${days} days.`
}

export function RecheckButton({
  domain,
  canRecheck: initialCanRecheck = true,
  nextAllowedAt: initialNextAllowedAt = null,
  intervalDays: initialIntervalDays,
  tier: initialTier = "free",
}: RecheckButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canRecheck, setCanRecheck] = useState(initialCanRecheck)
  const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(initialNextAllowedAt)
  const [intervalDays, setIntervalDays] = useState<number | undefined>(initialIntervalDays)
  const [tier, setTier] = useState<"free" | "paid">(initialTier)

  const recheck = async () => {
    if (!canRecheck) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      })
      const payload = await readJsonRecord(response)
      if (!response.ok) {
        if (typeof payload?.nextAllowedAt === "string") {
          setNextAllowedAt(payload.nextAllowedAt)
          setCanRecheck(false)
        }
        if (typeof payload?.intervalDays === "number") setIntervalDays(payload.intervalDays)
        if (payload?.tier === "paid" || payload?.tier === "free") setTier(payload.tier)
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to recheck")
      }
      if (typeof payload?.nextAllowedAt === "string") setNextAllowedAt(payload.nextAllowedAt)
      if (typeof payload?.intervalDays === "number") setIntervalDays(payload.intervalDays)
      if (payload?.tier === "paid" || payload?.tier === "free") setTier(payload.tier)
      setCanRecheck(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recheck")
    } finally {
      setLoading(false)
    }
  }

  const message = cadenceMessage({ canRecheck, nextAllowedAt, intervalDays, tier })
  const disabled = loading || !canRecheck

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={recheck}>
        {loading ? "Rechecking..." : "Recheck DR"}
      </Button>
      {error ? <span className="max-w-56 text-xs text-destructive">{error}</span> : null}
      {!error && message ? <span className="max-w-56 text-xs text-muted-foreground">{message}</span> : null}
    </div>
  )
}
