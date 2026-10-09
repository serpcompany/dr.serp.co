// The plan Pricing links to the billing page with.
import { describe, expect, it } from 'vitest'
import { planFromSearch } from './pricing'

describe('planFromSearch', () => {
  it('reads a size and period Pricing links with', () => {
    expect(planFromSearch({ plan: '50', period: 'annual' })).toEqual({
      domains: 50,
      billing: 'annual'
    })
    expect(planFromSearch({ plan: '12', period: 'monthly' })).toEqual({
      domains: 12,
      billing: 'monthly'
    })
  })

  it('ignores a size or period that isn’t sold', () => {
    expect(planFromSearch({ plan: '13', period: 'annual' })).toBeNull()
    expect(planFromSearch({ plan: '50', period: 'weekly' })).toBeNull()
    expect(planFromSearch({ plan: ['50', '100'], period: 'annual' })).toBeNull()
    expect(planFromSearch({})).toBeNull()
  })
})
