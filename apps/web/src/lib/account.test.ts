import { describe, expect, it } from 'vitest'
import {
  type AccountPlan,
  averageChange,
  monthChange,
  planLabel,
  planName,
  weeklyAverage
} from './account'

const at = (day: string, domainRating: number) => ({
  checkedAt: `${day}T00:00:00.000Z`,
  domainRating
})

describe('monthChange', () => {
  const now = new Date('2026-10-07T12:00:00.000Z')

  it('compares the latest reading with the last one at least 30 days old', () => {
    const history = [
      at('2026-08-01', 40),
      at('2026-09-05', 44),
      at('2026-09-20', 46),
      at('2026-10-07', 49)
    ]
    // 2026-09-07 is the cutoff: 09-05 is the last reading before it.
    expect(monthChange(history, now)).toBe(5)
  })

  it('is null without a reading from a month ago, or without readings', () => {
    expect(monthChange([at('2026-09-20', 46), at('2026-10-07', 49)], now)).toBeNull()
    expect(monthChange([], now)).toBeNull()
  })

  it('is null when the latest reading is older than a month', () => {
    // Last checked in March: nothing changed "this month" that we know of.
    expect(monthChange([at('2026-01-10', 40), at('2026-03-01', 44)], now)).toBeNull()
  })

  it('reports a fall as negative and no change as zero', () => {
    expect(monthChange([at('2026-08-01', 50), at('2026-10-01', 47)], now)).toBe(-3)
    expect(monthChange([at('2026-08-01', 50), at('2026-10-01', 50)], now)).toBe(0)
  })
})

describe('averageChange', () => {
  it("averages each site's change from its first reading to its latest", () => {
    expect(
      averageChange([
        [at('2026-01-01', 40), at('2026-10-01', 46)],
        [at('2026-03-01', 20), at('2026-09-01', 18)]
      ])
    ).toBe(2)
  })

  it("isn't moved by a site added this week, unlike the average chart", () => {
    const old = [at('2026-01-01', 40), at('2026-10-01', 41)]
    expect(averageChange([old, [at('2026-10-05', 90)]])).toBe(1)
  })

  it('is null when no site has readings 30 days apart', () => {
    expect(averageChange([[at('2026-10-01', 40), at('2026-10-05', 41)], []])).toBeNull()
  })
})

describe('weeklyAverage', () => {
  const now = new Date('2026-10-07T12:00:00.000Z')

  it('averages each site’s latest reading at the end of each week', () => {
    const points = weeklyAverage(
      [[at('2026-09-01', 40), at('2026-10-01', 50)], [at('2026-09-15', 20)]],
      now,
      6
    )
    expect(points.at(-1)).toEqual({ date: '2026-10-07', average: 35 })
    // Before the second site's first reading, only the first counts.
    expect(points[0]).toEqual({ date: '2026-09-02', average: 40 })
  })

  it('leaves out weeks before any reading', () => {
    expect(weeklyAverage([[at('2026-10-01', 30)]], now, 52)).toEqual([
      { date: '2026-10-07', average: 30 }
    ])
    expect(weeklyAverage([], now)).toEqual([])
  })
})

describe('planName', () => {
  const plan = (patch: Partial<AccountPlan>): AccountPlan => ({
    kind: 'active',
    paid: true,
    domains: 25,
    interval: 'monthly',
    price: 7,
    periodEnd: null,
    ...patch
  })

  it('names the plan by its sites', () => {
    expect(planName(plan({}))).toBe('25 sites')
    expect(planName(plan({ domains: null }))).toBe('Unlimited')
    expect(planName(plan({ kind: 'free' }))).toBe('Free')
  })

  it('labels the plan for the user menu', () => {
    expect(planLabel(plan({ domains: 12 }))).toBe('12-site plan')
    expect(planLabel(plan({ domains: null }))).toBe('Unlimited plan')
    expect(planLabel(plan({ kind: 'free', paid: false }))).toBe('Free plan')
  })
})
