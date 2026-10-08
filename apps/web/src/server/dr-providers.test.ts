import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchDomainRating,
  fetchDomainRatingHistory,
  fetchDrFromAhrefsApi
} from './dr-providers.mjs'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchDomainRating', () => {
  it('uses the Ahrefs API provider when AHREFS_API_KEY is configured', async () => {
    const previousApiKey = process.env.AHREFS_API_KEY
    process.env.AHREFS_API_KEY = 'test_api_key'

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          domain_rating: {
            domain_rating: 78.4,
            ahrefs_rank: 1234
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await fetchDomainRating({ target: 'https://www.Example.com/path?q=1' })

      expect(result).toEqual({
        provider: 'ahrefs',
        target: 'example.com',
        domainRating: 78.4,
        extra: {
          ahrefsRank: 1234,
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
        }
      })

      const requestedUrl = new URL(fetchMock.mock.calls[0][0])
      expect(requestedUrl.origin + requestedUrl.pathname).toBe(
        'https://api.ahrefs.com/v3/site-explorer/domain-rating'
      )
      expect(requestedUrl.searchParams.get('target')).toBe('example.com')
      expect(requestedUrl.searchParams.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(requestedUrl.searchParams.get('protocol')).toBe('both')
      expect(requestedUrl.searchParams.get('output')).toBe('json')
      expect(fetchMock.mock.calls[0][1]?.headers?.authorization).toBe('Bearer test_api_key')
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.AHREFS_API_KEY
      } else {
        process.env.AHREFS_API_KEY = previousApiKey
      }
    }
  })

  it('supports explicit Ahrefs API lookups with a fixed report date', async () => {
    const previousApiKey = process.env.AHREFS_API_KEY
    process.env.AHREFS_API_KEY = 'test_api_key'

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          domain_rating: {
            domain_rating: 12,
            ahrefs_rank: null
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await fetchDrFromAhrefsApi({ target: 'example.com', date: '2026-05-28' })

      expect(result.domainRating).toBe(12)
      expect(result.extra).toEqual({ ahrefsRank: null, date: '2026-05-28' })

      const requestedUrl = new URL(fetchMock.mock.calls[0][0])
      expect(requestedUrl.searchParams.get('date')).toBe('2026-05-28')
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.AHREFS_API_KEY
      } else {
        process.env.AHREFS_API_KEY = previousApiKey
      }
    }
  })

  it('fetches monthly Ahrefs Domain Rating history for the last two years by default', async () => {
    const previousApiKey = process.env.AHREFS_API_KEY
    process.env.AHREFS_API_KEY = 'test_api_key'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000Z'))

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          domain_ratings: [
            { date: '2024-05-28', domain_rating: 61.2 },
            { date: '2024-06-28', domain_rating: 62 }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await fetchDomainRatingHistory({ target: 'https://www.Example.com/path?q=1' })

      expect(result).toEqual({
        provider: 'ahrefs-history',
        target: 'example.com',
        dateFrom: '2024-05-28',
        dateTo: '2026-05-28',
        historyGrouping: 'monthly',
        points: [
          { checkedAt: '2024-05-28', domainRating: 61.2 },
          { checkedAt: '2024-06-28', domainRating: 62 }
        ]
      })

      const requestedUrl = new URL(fetchMock.mock.calls[0][0])
      expect(requestedUrl.origin + requestedUrl.pathname).toBe(
        'https://api.ahrefs.com/v3/site-explorer/domain-rating-history'
      )
      expect(requestedUrl.searchParams.get('target')).toBe('example.com')
      expect(requestedUrl.searchParams.get('date_from')).toBe('2024-05-28')
      expect(requestedUrl.searchParams.get('date_to')).toBe('2026-05-28')
      expect(requestedUrl.searchParams.get('history_grouping')).toBe('monthly')
      expect(requestedUrl.searchParams.get('protocol')).toBe('both')
      expect(requestedUrl.searchParams.get('output')).toBe('json')
      expect(fetchMock.mock.calls[0][1]?.headers?.authorization).toBe('Bearer test_api_key')
    } finally {
      vi.useRealTimers()
      if (previousApiKey === undefined) {
        delete process.env.AHREFS_API_KEY
      } else {
        process.env.AHREFS_API_KEY = previousApiKey
      }
    }
  })

  it('surfaces Ahrefs Domain Rating history API errors', async () => {
    const previousApiKey = process.env.AHREFS_API_KEY
    process.env.AHREFS_API_KEY = 'test_api_key'

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: 'Not enough API units'
          }
        }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      await expect(
        fetchDomainRatingHistory({
          target: 'example.com',
          dateFrom: '2024-05-28',
          dateTo: '2026-05-28'
        })
      ).rejects.toThrow('Not enough API units')
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.AHREFS_API_KEY
      } else {
        process.env.AHREFS_API_KEY = previousApiKey
      }
    }
  })

  it('normalizes targets before selecting a provider', async () => {
    const previousApiKey = process.env.AHREFS_API_KEY
    delete process.env.AHREFS_API_KEY

    try {
      await expect(
        fetchDomainRating({ target: 'https://www.Example.com/path?q=1' })
      ).rejects.toThrow('All providers unavailable')
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.AHREFS_API_KEY
      } else {
        process.env.AHREFS_API_KEY = previousApiKey
      }
    }
  })
})
