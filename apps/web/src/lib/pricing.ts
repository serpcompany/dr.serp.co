export type BillingPeriod = 'monthly' | 'annual'

export type PricingTier = {
  id: string
  domains: number
  monthly: number
  annual: number
}

export const PRICING_TIERS: PricingTier[] = [
  { id: '12', domains: 12, monthly: 4, annual: 40 },
  { id: '25', domains: 25, monthly: 7, annual: 70 },
  { id: '50', domains: 50, monthly: 15, annual: 150 },
  { id: '100', domains: 100, monthly: 27, annual: 270 }
]

/** A plan size and billing period, as Pricing and the billing page pick them. */
export type PlanChoice = { domains: number; billing: BillingPeriod }

/** The plan in the URL (`?plan=25&period=annual`, as Pricing links), or null. */
export function planFromSearch(
  params: Record<string, string | string[] | undefined>
): PlanChoice | null {
  const domains = Number(params.plan)
  const billing =
    params.period === 'annual' ? 'annual' : params.period === 'monthly' ? 'monthly' : null
  if (!billing || !PRICING_TIERS.some(tier => tier.domains === domains)) return null
  return { domains, billing }
}

export const PAID_FEATURES = [
  'Monitor up to your tier domain limit',
  'Scheduled DR updates once a week',
  'Unlimited on-demand updates',
  'Email notifications',
  'Weekly recap email',
  'Backlinks & referring domains',
  'Milestones',
  'Set goals and track progress',
  'Leaderboard listing',
  'Domain directory listing',
  'Do-follow homepage link on /sites/{page}',
  'No ads'
]

export const FREE_FEATURES = [
  'Public DR page per domain',
  'Public site title and meta description on /sites/{page}',
  'Best-effort site preview screenshot',
  'Nofollow homepage link on /sites/{page}',
  'Embeddable verified badge',
  'Recheck button (best-effort)'
]
