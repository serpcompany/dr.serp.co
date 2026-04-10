"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

export function RecheckButton({ domain }: { domain: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recheck = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to recheck")
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recheck")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" disabled={loading} onClick={recheck}>
        {loading ? "Rechecking..." : "Recheck DR"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  )
}
