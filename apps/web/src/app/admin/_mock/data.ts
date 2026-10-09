// Sample records for the admin mockups (#126). Domains are real public sites; emails are example
// addresses; numbers are invented but plausible.
export type MockSite = {
  domain: string
  dr: number | null
  title: string
  description: string
  owner: string | null
  link: 'follow' | 'nofollow'
  lastChecked: string
  checks: { date: string; dr: number }[]
}

export const SITES: MockSite[] = [
  { domain: 'github.com', dr: 96, title: 'GitHub', description: 'Where the world builds software.', owner: null, link: 'nofollow', lastChecked: 'Oct 8, 2026', checks: [{ date: 'Oct 8, 2026', dr: 96 }, { date: 'Sep 25, 2026', dr: 96 }, { date: 'Aug 25, 2026', dr: 95 }] },
  { domain: 'wikipedia.org', dr: 96, title: 'Wikipedia', description: 'The free encyclopedia.', owner: null, link: 'nofollow', lastChecked: 'Oct 6, 2026', checks: [{ date: 'Oct 6, 2026', dr: 96 }] },
  { domain: 'ahrefs.com', dr: 91, title: 'Ahrefs', description: 'SEO tools and resources to grow your search traffic.', owner: 'growth@ahrefs.example', link: 'follow', lastChecked: 'Oct 9, 2026', checks: [{ date: 'Oct 9, 2026', dr: 91 }, { date: 'Oct 2, 2026', dr: 91 }] },
  { domain: 'best.serp.co', dr: 54, title: 'Best SERP', description: 'Curated lists of the best software.', owner: 'devin@serp.example', link: 'follow', lastChecked: 'Oct 9, 2026', checks: [{ date: 'Oct 9, 2026', dr: 54 }, { date: 'Oct 2, 2026', dr: 53 }, { date: 'Sep 25, 2026', dr: 51 }] },
  { domain: 'plausible.io', dr: 78, title: 'Plausible Analytics', description: 'Simple, privacy-friendly Google Analytics alternative.', owner: 'marketing@plausible.example', link: 'follow', lastChecked: 'Oct 7, 2026', checks: [{ date: 'Oct 7, 2026', dr: 78 }] },
  { domain: 'indiehackers.com', dr: 83, title: 'Indie Hackers', description: 'Work together to build profitable online businesses.', owner: null, link: 'nofollow', lastChecked: 'Oct 1, 2026', checks: [{ date: 'Oct 1, 2026', dr: 83 }] },
  { domain: 'claimed-site.dev', dr: 41, title: 'A claimed site', description: 'Owned by a subscriber.', owner: 'owner@example.com', link: 'follow', lastChecked: 'Oct 2, 2026', checks: [{ date: 'Oct 2, 2026', dr: 41 }, { date: 'Sep 2, 2026', dr: 39 }] },
  { domain: 'shopify.com', dr: 96, title: 'Shopify', description: 'Commerce platform for every business.', owner: null, link: 'nofollow', lastChecked: 'Sep 30, 2026', checks: [{ date: 'Sep 30, 2026', dr: 96 }] }
]

export type MockSubscription = {
  email: string
  domains: number
  interval: 'Monthly' | 'Annual'
  status: 'active' | 'past_due' | 'canceled' | 'trialing'
  used: number
  renews: string
  cancelAtPeriodEnd: boolean
  customer: string
}

export const SUBSCRIPTIONS: MockSubscription[] = [
  { email: 'devin@serp.example', domains: 100, interval: 'Annual', status: 'active', used: 37, renews: 'Mar 3, 2027', cancelAtPeriodEnd: false, customer: 'cus_Q7x2' },
  { email: 'growth@ahrefs.example', domains: 25, interval: 'Monthly', status: 'active', used: 12, renews: 'Oct 21, 2026', cancelAtPeriodEnd: false, customer: 'cus_R1a9' },
  { email: 'marketing@plausible.example', domains: 12, interval: 'Monthly', status: 'active', used: 4, renews: 'Oct 15, 2026', cancelAtPeriodEnd: true, customer: 'cus_P4k0' },
  { email: 'owner@example.com', domains: 12, interval: 'Monthly', status: 'past_due', used: 1, renews: 'Oct 2, 2026', cancelAtPeriodEnd: false, customer: 'cus_S8m3' },
  { email: 'founder@startup.example', domains: 50, interval: 'Annual', status: 'canceled', used: 0, renews: 'Sep 12, 2026', cancelAtPeriodEnd: false, customer: 'cus_T2b6' }
]

export type MockEvent = {
  time: string
  type: string
  email: string
  status: string
  ok: boolean
  error: string | null
}

export const EVENTS: MockEvent[] = [
  { time: 'Oct 9, 2026, 09:14', type: 'customer.subscription.updated', email: 'growth@ahrefs.example', status: 'active', ok: true, error: null },
  { time: 'Oct 9, 2026, 08:02', type: 'invoice.payment_failed', email: 'owner@example.com', status: 'past_due', ok: true, error: null },
  { time: 'Oct 8, 2026, 22:41', type: 'customer.subscription.updated', email: 'marketing@plausible.example', status: 'active', ok: true, error: null },
  { time: 'Sep 27, 2026, 05:19', type: 'customer.subscription.updated', email: 'lists@serplists.example', status: 'active', ok: false, error: 'No dr.serp.co price on the subscription (another SERP product)' },
  { time: 'Sep 26, 2026, 17:03', type: 'checkout.session.completed', email: 'devin@serp.example', status: 'active', ok: true, error: null },
  { time: 'Sep 12, 2026, 11:30', type: 'customer.subscription.deleted', email: 'founder@startup.example', status: 'canceled', ok: true, error: null }
]

export type MockAdmin = { email: string; addedBy: string; addedAt: string; you?: boolean }

export const ADMINS: MockAdmin[] = [
  { email: 'devin@serp.example', addedBy: 'Migration', addedAt: 'Oct 10, 2026', you: true },
  { email: 'ops@serp.example', addedBy: 'devin@serp.example', addedAt: 'Oct 12, 2026' }
]
