import { getServerEnv } from "@/lib/env"
import type { BillingPeriod } from "@/lib/pricing"

const REQUIRED_TIERS = [12, 25, 50, 100] as const

type PriceConfig = {
  monthly: Record<string, string>
  annual: Record<string, string>
}

let cachedConfig: PriceConfig | null = null

function parsePriceConfig(): PriceConfig {
  if (cachedConfig) return cachedConfig

  const env = getServerEnv()
  let parsed: PriceConfig

  try {
    parsed = JSON.parse(env.STRIPE_PRICE_IDS) as PriceConfig
  } catch {
    throw new Error("STRIPE_PRICE_IDS must be valid JSON")
  }

  if (!parsed?.monthly || !parsed?.annual) {
    throw new Error("STRIPE_PRICE_IDS must include monthly and annual price maps")
  }

  for (const tier of REQUIRED_TIERS) {
    const key = String(tier)
    if (!parsed.monthly[key] || !parsed.annual[key]) {
      throw new Error(`Missing price IDs for ${tier} domains`)
    }
  }

  cachedConfig = parsed
  return parsed
}

export function getPriceId(domains: number, billing: BillingPeriod): string {
  const config = parsePriceConfig()
  const key = String(domains)
  const priceId = billing === "annual" ? config.annual[key] : config.monthly[key]

  if (!priceId) {
    throw new Error("Unsupported pricing tier")
  }

  return priceId
}

export function getTierForPriceId(priceId: string): { domains: number; billing: BillingPeriod } | null {
  const config = parsePriceConfig()
  const entries = [
    ...Object.entries(config.monthly).map(([domains, id]) => ({
      domains: Number(domains),
      billing: "monthly" as const,
      id,
    })),
    ...Object.entries(config.annual).map(([domains, id]) => ({
      domains: Number(domains),
      billing: "annual" as const,
      id,
    })),
  ]

  const match = entries.find((entry) => entry.id === priceId)
  if (!match || !Number.isFinite(match.domains)) return null
  return { domains: match.domains, billing: match.billing }
}
