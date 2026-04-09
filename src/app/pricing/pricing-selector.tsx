"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { PAID_FEATURES, PRICING_TIERS } from "@/lib/pricing"

const BILLING_LABELS = {
  monthly: "Monthly",
  annual: "Annual",
}

export function PricingSelector() {
  const [tierIndex, setTierIndex] = useState(0)
  const [isAnnual, setIsAnnual] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tier = PRICING_TIERS[tierIndex]
  const price = isAnnual ? tier.annual : tier.monthly
  const priceLabel = isAnnual ? "/year" : "/month"

  const sliderValue = useMemo(() => [tierIndex], [tierIndex])

  const handleCheckout = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      const storedEmail =
        typeof window !== "undefined"
          ? window.localStorage.getItem("dr-auth-email")?.trim().toLowerCase()
          : null

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domains: tier.domains,
          billing: isAnnual ? "annual" : "monthly",
          email: storedEmail || undefined,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Unable to start checkout.")
      }

      const payload = await response.json()
      if (!payload?.url) {
        throw new Error("Stripe checkout URL not returned.")
      }

      window.location.href = payload.url
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to start checkout."
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="border-primary shadow-md">
      <CardHeader className="flex flex-col gap-2">
        <CardTitle className="text-xl">SERP DR Pro Subscription</CardTitle>
        <p className="text-sm text-muted-foreground">
          Everything you need to monitor DR across multiple domains.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium">How many domains do you want to monitor?</p>
            <p className="text-xs text-muted-foreground">Based on your selected tier.</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">${price}</p>
            <p className="text-xs text-muted-foreground">
              {priceLabel} · {BILLING_LABELS[isAnnual ? "annual" : "monthly"]}
              {isAnnual ? " (2 months free)" : ""}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <Slider
            min={0}
            max={PRICING_TIERS.length - 1}
            step={1}
            value={sliderValue}
            onValueChange={(value) => setTierIndex(value[0])}
          />
          <div className="grid grid-cols-4 text-center text-xs text-muted-foreground">
            {PRICING_TIERS.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTierIndex(index)}
                className={cn(
                  "transition-colors",
                  index === tierIndex ? "text-foreground font-semibold" : "hover:text-foreground"
                )}
              >
                {item.domains}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-dashed p-3 text-sm">
            Monitor up to <span className="font-semibold">{tier.domains}</span> domains.
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
          <span className={cn(!isAnnual ? "font-semibold text-foreground" : "text-muted-foreground")}>
            Monthly
          </span>
          <Switch
            checked={isAnnual}
            onCheckedChange={setIsAnnual}
            aria-label="Toggle annual billing"
          />
          <span className={cn(isAnnual ? "font-semibold text-foreground" : "text-muted-foreground")}>
            Annual
          </span>
          <span className="text-xs text-muted-foreground">(2 months free)</span>
        </div>

        <div>
          <p className="text-sm font-medium">Included with every paid tier</p>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {PAID_FEATURES.map((feature) => (
              <li key={feature}>• {feature}</li>
            ))}
          </ul>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2">
        <Button onClick={handleCheckout} disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Starting checkout..." : "Start monitoring"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Secure checkout handled by Stripe.
        </p>
      </CardFooter>
    </Card>
  )
}
