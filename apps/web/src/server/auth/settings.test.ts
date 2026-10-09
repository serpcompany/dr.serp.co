import { describe, expect, it } from 'vitest'

import { readAuthSettings } from './settings'

const SECRET = 'x'.repeat(32)

describe('readAuthSettings', () => {
  it('reads the deployed secret and canonical origin', () => {
    expect(
      readAuthSettings({
        SITE_ENV: 'production',
        BETTER_AUTH_SECRET: SECRET,
        BETTER_AUTH_URL: 'https://dr.serp.co'
      })
    ).toEqual({
      ok: true,
      settings: {
        environment: 'production',
        secret: SECRET,
        baseURL: 'https://dr.serp.co',
        trustedOrigins: ['https://dr.serp.co'],
        useSecureCookies: true
      }
    })
  })

  it('fails closed when Staging or Production lacks either value, or the URL is not an https origin', () => {
    for (const env of [
      { SITE_ENV: 'staging', BETTER_AUTH_URL: 'https://staging-dr.serp.co' },
      {
        SITE_ENV: 'production',
        BETTER_AUTH_SECRET: 'short',
        BETTER_AUTH_URL: 'https://dr.serp.co'
      },
      { SITE_ENV: 'production', BETTER_AUTH_SECRET: SECRET },
      { SITE_ENV: 'production', BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: 'http://dr.serp.co' },
      {
        SITE_ENV: 'production',
        BETTER_AUTH_SECRET: SECRET,
        BETTER_AUTH_URL: 'https://dr.serp.co/api'
      }
    ]) {
      expect(readAuthSettings(env).ok, JSON.stringify(env)).toBe(false)
    }
  })

  it('lets only an explicitly local run fall back to a throwaway secret and localhost', () => {
    for (const env of [{ SITE_ENV: 'local' }, { NODE_ENV: 'development' }]) {
      const local = readAuthSettings(env)
      expect(local.ok && local.settings, JSON.stringify(env)).toMatchObject({
        environment: 'local',
        baseURL: 'http://localhost:3000',
        useSecureCookies: false
      })
    }
  })

  it('fails closed when SITE_ENV is missing or misspelled', () => {
    expect(readAuthSettings({}).ok).toBe(false)
    expect(readAuthSettings({ SITE_ENV: 'prod' }).ok).toBe(false)
  })
})
