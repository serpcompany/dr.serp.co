export type BillingPeriod = "monthly" | "annual"

export type PricingTier = {
  id: string
  domains: number
  monthly: number
  annual: number
}

export const PRICING_TIERS: PricingTier[] = [
  { id: "12", domains: 12, monthly: 4, annual: 40 },
  { id: "25", domains: 25, monthly: 7, annual: 70 },
  { id: "50", domains: 50, monthly: 15, annual: 150 },
  { id: "100", domains: 100, monthly: 27, annual: 270 },
]

export const PAID_FEATURES = [
  "Monitor up to your tier domain limit",
  "Scheduled DR updates once a week",
  "Unlimited on-demand updates",
  "Email notifications",
  "Weekly recap email",
  "Backlinks & referring domains",
  "Milestones",
  "Set goals and track progress",
  "Leaderboard listing",
  "Domain directory listing",
  "Do-follow backlinks (2 per domain)",
  "No ads",
]

export const FREE_FEATURES = [
  "Public DR page per domain",
  "Embeddable verified badge",
  "Recheck button (best-effort)",
]
