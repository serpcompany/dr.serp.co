// Mockup branch only: sample data for the account area screens.
export const USER = { email: 'devin@serp.example', initials: 'DS', plan: '25-site plan' }

export type MockSite = {
  domain: string
  title: string
  dr: number
  change: number
  checkedAt: string
  link: 'dofollow' | 'nofollow'
}

export const SITES: MockSite[] = [
  {
    domain: 'best.serp.co',
    title: 'Best — reviews of the best software',
    dr: 54,
    change: 2,
    checkedAt: 'Oct 7',
    link: 'dofollow'
  },
  {
    domain: 'serp.co',
    title: 'SERP — search marketing tools',
    dr: 71,
    change: 0,
    checkedAt: 'Oct 7',
    link: 'dofollow'
  },
  {
    domain: 'serp.ly',
    title: 'serp.ly — short links',
    dr: 38,
    change: -1,
    checkedAt: 'Oct 6',
    link: 'dofollow'
  },
  {
    domain: 'keybumps.com',
    title: 'Keybumps — mechanical keyboard parts',
    dr: 22,
    change: 3,
    checkedAt: 'Oct 6',
    link: 'dofollow'
  },
  {
    domain: 'auctiondomains.io',
    title: 'Auction Domains — expiring domain finder',
    dr: 17,
    change: 0,
    checkedAt: 'Oct 5',
    link: 'dofollow'
  },
  {
    domain: 'slingshot.tools',
    title: 'Slingshot — 2FA for teams',
    dr: 9,
    change: 1,
    checkedAt: 'Oct 3',
    link: 'dofollow'
  },
  {
    domain: 'devin.blog',
    title: 'Notes on search, mostly',
    dr: 4,
    change: 0,
    checkedAt: 'Sep 30',
    link: 'dofollow'
  }
]

export const PLAN = {
  name: '25 sites',
  domains: 25,
  price: '$7',
  period: 'month',
  renews: 'Nov 9, 2026',
  card: 'Visa ending 4242'
}

export const HISTORY = [
  { checkedAt: '2026-04-07', domainRating: 41 },
  { checkedAt: '2026-05-07', domainRating: 44 },
  { checkedAt: '2026-06-07', domainRating: 47 },
  { checkedAt: '2026-07-07', domainRating: 49 },
  { checkedAt: '2026-08-07', domainRating: 50 },
  { checkedAt: '2026-09-07', domainRating: 52 },
  { checkedAt: '2026-10-07', domainRating: 54 }
]

/** The state a mock screen renders, from `?state=`. */
export async function stateOf(
  searchParams: Promise<Record<string, string | string[] | undefined>>
) {
  const state = (await searchParams).state
  return typeof state === 'string' ? state : ''
}

/** The average DR of the claimed sites at each weekly check, for the overview chart. */
export const AVERAGE_DR = Array.from({ length: 52 }, (_, week) => {
  const date = new Date(Date.UTC(2025, 9, 13 + week * 7))
  const wobble = Math.round(Math.sin(week / 3) * 0.8)
  return {
    date: date.toISOString().slice(0, 10),
    average: Math.round(24 + (week / 51) * 7) + wobble
  }
})
