// Better Auth's configuration, read per request from the environment (better-auth.md § Setup).
// Staging and Production need BETTER_AUTH_SECRET (a Worker secret of 32+ characters) and
// BETTER_AUTH_URL (the canonical https origin, a var); without them sign-in answers 503. Only a
// local run falls back to a throwaway secret and http://localhost:3000.
import { isProductionSite } from '@/lib/site-env'

export type AuthEnvironment = 'production' | 'staging' | 'local'

export type AuthSettings = {
  environment: AuthEnvironment
  secret: string
  baseURL: string
  trustedOrigins: string[]
  useSecureCookies: boolean
}

export type AuthSettingsResult =
  | { ok: true; settings: AuthSettings }
  | { ok: false; problem: string }

const LOCAL_SECRET = 'dr-serp-local-only-secret-never-used-when-deployed'
const LOCAL_URL = 'http://localhost:3000'
const MIN_SECRET_LENGTH = 32

function environmentOf(siteEnv: string | undefined): AuthEnvironment {
  if (isProductionSite(siteEnv)) return 'production'
  return siteEnv === 'staging' ? 'staging' : 'local'
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value)
    return url.origin === value.replace(/\/$/, '') ? url.origin : null
  } catch {
    return null
  }
}

export function readAuthSettings(env: Record<string, string | undefined>): AuthSettingsResult {
  const environment = environmentOf(env.SITE_ENV)
  const deployed = environment !== 'local'

  const secret = env.BETTER_AUTH_SECRET?.trim() || (deployed ? '' : LOCAL_SECRET)
  if (secret.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      problem: `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`
    }
  }

  const baseURL = originOf(env.BETTER_AUTH_URL?.trim() || (deployed ? '' : LOCAL_URL))
  if (!baseURL)
    return { ok: false, problem: 'BETTER_AUTH_URL must be an origin, like https://dr.serp.co' }
  if (deployed && !baseURL.startsWith('https://')) {
    return { ok: false, problem: 'BETTER_AUTH_URL must be https outside local runs' }
  }

  return {
    ok: true,
    settings: {
      environment,
      secret,
      baseURL,
      trustedOrigins: [baseURL],
      useSecureCookies: baseURL.startsWith('https://')
    }
  }
}
