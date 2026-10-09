// The Better Auth server (#134): email-code sign-in for everyone, sessions in D1 through Drizzle.
//
// - Sign-in is a six-digit code by email (`sender.ts`); a first sign-in creates the account.
//   Only the four endpoints in ALLOWED_AUTH_ENDPOINTS are served over HTTP; every other Better
//   Auth endpoint (passwords, social, account linking, profile updates, deletion, anything an
//   upgrade adds) answers 404 before Better Auth sees the request.
// - Codes are stored hashed, expire in ten minutes and allow three guesses.
// - Limits run on the RATE_LIMITER Durable Object (the AGENTS.md exception), keyed by HMAC
//   digests, never raw emails or IPs. Better Auth's own limiter is off: it counts per isolate.
//   A per-email limit answers exactly like a sent code, so no response reveals an account.
//
// No Next.js or server-only imports: tests run this real configuration against local D1.

import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { betterAuth } from 'better-auth/minimal'
import { emailOTP } from 'better-auth/plugins/email-otp'

import type { Db } from '@/db/client'
import { accounts, sessions, users, verification } from '@/db/schema'
import { AUTH_COOKIE_PREFIX } from './cookies'
import type { CodeSender } from './sender'
import type { AuthSettings } from './settings'

export const AUTH_BASE_PATH = '/api/auth'
export const SEND_OTP_PATH = '/email-otp/send-verification-otp'
export const SIGN_IN_OTP_PATH = '/sign-in/email-otp'
export const GET_SESSION_PATH = '/get-session'
export const SIGN_OUT_PATH = '/sign-out'

export const OTP_LENGTH = 6
export const OTP_EXPIRES_IN_SECONDS = 10 * 60
export const OTP_ALLOWED_ATTEMPTS = 3
export const SESSION_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60

/** The only Better Auth endpoints served over HTTP. */
export const ALLOWED_AUTH_ENDPOINTS = [
  { method: 'POST', path: SEND_OTP_PATH },
  { method: 'POST', path: SIGN_IN_OTP_PATH },
  { method: 'GET', path: GET_SESSION_PATH },
  { method: 'POST', path: SIGN_OUT_PATH }
] as const

export type LimitRule = { key: string; points: number; duration: number }
export type LimitResult = { allowed: boolean; unavailable?: boolean; retryAfterMs: number }
/** One counted request against a rule; the site passes checkRateLimit (the Durable Object). */
export type Limiter = (rule: LimitRule) => Promise<LimitResult>

/** Code requests per client (IP), per email, and code guesses per client. */
export const OTP_CLIENT_RULES = [
  { name: 'otp-client-minute', points: 5, duration: 60 },
  { name: 'otp-client-hour', points: 20, duration: 3600 }
]
export const OTP_EMAIL_RULES = [
  { name: 'otp-email-minute', points: 1, duration: 60 },
  { name: 'otp-email-hour', points: 5, duration: 3600 }
]
export const SIGN_IN_CLIENT_RULES = [
  { name: 'sign-in-client-minute', points: 10, duration: 60 },
  { name: 'sign-in-client-hour', points: 60, duration: 3600 }
]

export type Auth = {
  api: {
    getSession(input: { headers: Headers }): Promise<{
      session: { id: string; userId: string; expiresAt: Date }
      user: { id: string; email: string; emailVerified: boolean }
    } | null>
  }
  /** Serves an /api/auth/* request; anything outside the allowlist is 404. */
  handler(request: Request): Promise<Response>
  /** Every HTTP endpoint Better Auth registered, for the allowlist test. */
  readonly routes: readonly { methods: readonly string[]; path: string }[]
}

export type CreateAuthOptions = {
  db: Db
  settings: AuthSettings
  sender: CodeSender
  limit: Limiter
}

const encoder = new TextEncoder()

async function digester(secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`dr-serp rate limits\u0000${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return async (value: string) => {
    const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
    return Array.from(new Uint8Array(digest).slice(0, 16), byte =>
      byte.toString(16).padStart(2, '0')
    ).join('')
  }
}

/** The client's address: Cloudflare's header, else (local runs) the forwarded one. */
export function clientIp(headers: Headers | undefined): string {
  const ip =
    headers?.get('cf-connecting-ip')?.trim() ||
    headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  // An IPv6 client counts as its /64, so one host can't rotate through its allocation.
  return ip.includes(':') ? `${ip.split(':').slice(0, 4).join(':')}::/64` : ip
}

/** Keeps only the digits of a pasted code ("482 913" or "482-913" is the code). */
export function codeDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function rateLimited(retryAfterMs: number): APIError {
  const seconds = String(Math.max(1, Math.ceil(retryAfterMs / 1000)))
  return new APIError(
    'TOO_MANY_REQUESTS',
    { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
    { 'Retry-After': seconds }
  )
}

function unavailable(code: string, message: string): APIError {
  return new APIError('SERVICE_UNAVAILABLE', { code, message })
}

function notFound(): Response {
  return Response.json(
    { error: 'not_found', message: 'No such auth endpoint.' },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

/**
 * get-session answers the session row, token included; the token is the session cookie's value,
 * which stays HttpOnly only if scripts never see it. Everything else passes through, including a
 * refreshed cookie.
 */
async function withoutSessionToken(response: Response): Promise<Response> {
  if (!response.ok) return response
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    session?: Record<string, unknown>
  } | null
  if (!body?.session || !('token' in body.session)) return response
  const { token: _token, ...session } = body.session
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(JSON.stringify({ ...body, session }), { status: response.status, headers })
}

export function createAuth({ db, settings, sender, limit }: CreateAuthOptions): Auth {
  const digest = digester(settings.secret)
  digest.catch(() => undefined)

  /** Counts the request against every rule; the first refusal wins. */
  async function consume(
    rules: readonly { name: string; points: number; duration: number }[],
    subject: string
  ): Promise<LimitResult> {
    const hashed = await (await digest)(subject)
    for (const rule of rules) {
      const result = await limit({
        key: `${rule.name}:${hashed}`,
        points: rule.points,
        duration: rule.duration
      })
      if (!result.allowed) return result
    }
    return { allowed: true, retryAfterMs: 0 }
  }

  const otpPlugin = emailOTP({
    otpLength: OTP_LENGTH,
    expiresIn: OTP_EXPIRES_IN_SECONDS,
    allowedAttempts: OTP_ALLOWED_ATTEMPTS,
    storeOTP: 'hashed',
    // Better Auth awaits this and swallows a failure, so the response never says whether an
    // email went out; `email` is already lowercased.
    async sendVerificationOTP({ email, otp }) {
      await sender.send({ email, otp, expiresInSeconds: OTP_EXPIRES_IN_SECONDS })
    }
  })

  const instance = betterAuth({
    appName: 'DR Checker',
    basePath: AUTH_BASE_PATH,
    baseURL: settings.baseURL,
    secret: settings.secret,
    trustedOrigins: settings.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { users, sessions, accounts, verification }
    }),
    user: { modelName: 'users' },
    session: { modelName: 'sessions', expiresIn: SESSION_EXPIRES_IN_SECONDS },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verification' },
    emailAndPassword: { enabled: false },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      // Explicit, so the origin and CSRF checks never depend on NODE_ENV (Better Auth skips
      // them under test by default).
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      useSecureCookies: settings.useSecureCookies
    },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        const headers = ctx.request?.headers
        if (ctx.path === SEND_OTP_PATH) {
          // Better Auth swallows delivery errors, so a site that can't send email refuses
          // before a code exists, and says so.
          if (!sender.ready()) {
            throw unavailable(
              'OTP_DELIVERY_UNAVAILABLE',
              'Sign-in codes are unavailable right now.'
            )
          }
          const body = (ctx.body ?? {}) as { email?: unknown; type?: unknown }
          if (body.type !== 'sign-in') {
            throw new APIError('BAD_REQUEST', {
              code: 'UNSUPPORTED_OTP_TYPE',
              message: 'Only sign-in codes are supported.'
            })
          }
          if (typeof body.email !== 'string' || body.email.trim() === '') return
          // Per-client limits don't depend on the email, so their 429 reveals nothing.
          const client = await consume(OTP_CLIENT_RULES, clientIp(headers))
          if (client.unavailable)
            throw unavailable('RATE_LIMITER_UNAVAILABLE', 'Sign-in is unavailable right now.')
          if (!client.allowed) throw rateLimited(client.retryAfterMs)
          const email = await consume(OTP_EMAIL_RULES, body.email.trim().toLowerCase())
          if (email.unavailable)
            throw unavailable('RATE_LIMITER_UNAVAILABLE', 'Sign-in is unavailable right now.')
          // A per-email limit answers exactly like a sent code, and sends nothing.
          if (!email.allowed) return ctx.json({ success: true })
          return
        }
        if (ctx.path === SIGN_IN_OTP_PATH) {
          const body = (ctx.body ?? {}) as { otp?: unknown; image?: unknown; name?: unknown }
          if (body.image !== undefined || body.name !== undefined) {
            throw new APIError('BAD_REQUEST', {
              code: 'FIELD_NOT_ALLOWED',
              message: 'Only an email and a code can be sent.'
            })
          }
          const guesses = await consume(SIGN_IN_CLIENT_RULES, clientIp(headers))
          if (guesses.unavailable)
            throw unavailable('RATE_LIMITER_UNAVAILABLE', 'Sign-in is unavailable right now.')
          if (!guesses.allowed) throw rateLimited(guesses.retryAfterMs)
          if (typeof body.otp === 'string' && body.otp !== codeDigits(body.otp)) {
            return { context: { body: { ...ctx.body, otp: codeDigits(body.otp) } } }
          }
        }
      })
    },
    plugins: [otpPlugin]
  })

  const routes = Object.values(
    instance.api as Record<string, { path?: string; options?: { method?: string | string[] } }>
  )
    .filter((endpoint): endpoint is { path: string; options?: { method?: string | string[] } } =>
      Boolean(endpoint?.path)
    )
    .map(endpoint => ({
      methods: [endpoint.options?.method ?? 'GET'].flat().map(method => method.toUpperCase()),
      path: endpoint.path
    }))

  return {
    api: instance.api as unknown as Auth['api'],
    async handler(request) {
      const { pathname } = new URL(request.url)
      const path = pathname.startsWith(`${AUTH_BASE_PATH}/`)
        ? pathname.slice(AUTH_BASE_PATH.length)
        : null
      const served = ALLOWED_AUTH_ENDPOINTS.some(
        endpoint => endpoint.method === request.method && endpoint.path === path
      )
      if (!served) return notFound()
      const response = await instance.handler(request)
      return path === GET_SESSION_PATH ? withoutSessionToken(response) : response
    },
    routes
  }
}
