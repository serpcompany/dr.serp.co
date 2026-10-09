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

import { and, eq } from 'drizzle-orm'

import type { Db } from '@/db/client'
import { accounts, sessions, users, verification } from '@/db/schema'
import {
  SIGN_IN_CODE_ATTEMPTS,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_CODE_TTL_SECONDS,
  signInCodeDigits
} from '@/lib/sign-in-code'
import { clientIp } from './client-ip'
import {
  type BoundCode,
  clearCodeBindingSetCookie,
  codeBindingCookieName,
  codeBindingCookieOptions,
  decoyCodeBinding,
  findCodeBinding,
  hashOtp,
  issueCodeBinding,
  readCodeBindingTokens
} from './code-binding'
import { AUTH_COOKIE_PREFIX } from './cookies'
import {
  CODE_BINDING_KEY_LABEL,
  deriveKey,
  digest,
  KNOWN_DEVICE_KEY_LABEL,
  RATE_LIMIT_KEY_LABEL
} from './keys'
import { anyKnownDevice, issueKnownDevice, knownDeviceSetCookie } from './known-device'
import { authLogger } from './logging'
import type { CodeSender } from './sender'
import type { AuthSettings } from './settings'

export const AUTH_BASE_PATH = '/api/auth'
export const SEND_OTP_PATH = '/email-otp/send-verification-otp'
export const SIGN_IN_OTP_PATH = '/sign-in/email-otp'
export const GET_SESSION_PATH = '/get-session'
export const SIGN_OUT_PATH = '/sign-out'

export const OTP_LENGTH = SIGN_IN_CODE_LENGTH
export const OTP_EXPIRES_IN_SECONDS = SIGN_IN_CODE_TTL_SECONDS
export const OTP_ALLOWED_ATTEMPTS = SIGN_IN_CODE_ATTEMPTS
export const SESSION_EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60
/** The largest body an auth request may send, like readWriteRequest's cap; theirs are tiny. */
export const MAX_AUTH_BODY_BYTES = 16_000

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

type Rule = { name: string; points: number; duration: number }

/** Code requests per client (IP or IPv6 /64), the same for every email. A denial answers 429. */
export const OTP_CLIENT_RULES: Rule[] = [
  { name: 'otp-client-minute', points: 5, duration: 60 },
  { name: 'otp-client-hour', points: 20, duration: 3600 }
]

/**
 * Who is asking for a code decides its email limits. A denial answers exactly like a sent code.
 * - new: no verified account; 1 a minute and 5 an hour per email, 300 an hour site-wide.
 * - member: a verified account, from a browser without its known-device cookie; 1 a minute and 5
 *   an hour per email and client, and 20 an hour per email.
 * - known-device: the member's own browser, which spends a separate 10 an hour per email, so
 *   someone flooding the email from elsewhere can't lock the owner out.
 */
export type EmailStanding = 'new' | 'member' | 'known-device'

export function otpEmailRules(standing: EmailStanding, email: string, ip: string) {
  const perEmailAndClient = [
    { name: 'otp-email-client-minute', points: 1, duration: 60, subject: `${email}\0${ip}` },
    { name: 'otp-email-client-hour', points: 5, duration: 3600, subject: `${email}\0${ip}` }
  ]
  if (standing === 'new') {
    return [
      { name: 'otp-email-minute', points: 1, duration: 60, subject: email },
      { name: 'otp-email-hour', points: 5, duration: 3600, subject: email },
      { name: 'otp-site-hour', points: 300, duration: 3600, subject: 'all' }
    ]
  }
  return standing === 'member'
    ? [
        ...perEmailAndClient,
        { name: 'otp-member-hour', points: 20, duration: 3600, subject: email }
      ]
    : [
        ...perEmailAndClient,
        { name: 'otp-known-device-hour', points: 10, duration: 3600, subject: email }
      ]
}

/** Code guesses per client, on top of the 3 guesses per code. */
export const SIGN_IN_CLIENT_RULES: Rule[] = [
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

/**
 * The address every limit, binding and Better Auth itself use: trimmed and lowercased. Better
 * Auth only lowercases, so without the trim a padded address would count against the real one's
 * limits and then be refused, which tells a limited email from an allowed one.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Keeps only the digits of a pasted code ("482 913" or "482-913" is the code). */
export function codeDigits(value: string): string {
  return signInCodeDigits(value)
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

/**
 * The request with its body read into memory, or null when the body passes `maxBytes`. Counts
 * bytes as they stream in, so a chunked body with no Content-Length is cut off at the cap.
 */
async function withCappedBody(request: Request, maxBytes: number): Promise<Request | null> {
  if (Number(request.headers.get('content-length') || '0') > maxBytes) return null
  if (!request.body) return request
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  // Rebuilt from its parts: under OpenNext the incoming request isn't one workerd's Request
  // constructor takes as input (it throws "Invalid URL: [object Request]").
  return new Request(request.url, { method: request.method, headers: request.headers, body })
}

function notFound(): Response {
  return Response.json(
    { error: 'not_found', message: 'No such auth endpoint.' },
    { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

/**
 * get-session answers the session row and sign-in a top-level `token`; either is the session
 * cookie's value, which stays HttpOnly only if scripts never see it. Everything else passes
 * through, including a refreshed cookie.
 */
async function withoutSessionToken(response: Response): Promise<Response> {
  if (!response.ok) return response
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as
    | ({ token?: unknown; session?: Record<string, unknown> } & Record<string, unknown>)
    | null
  if (!body || typeof body !== 'object') return response
  const hasSessionToken = Boolean(body.session && 'token' in body.session)
  if (!('token' in body) && !hasSessionToken) return response
  const { token: _token, ...rest } = body
  const cleaned: Record<string, unknown> = rest
  if (body.session && hasSessionToken) {
    const { token: _sessionToken, ...session } = body.session
    cleaned.session = session
  }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(JSON.stringify(cleaned), { status: response.status, headers })
}

/** What the hooks read of Better Auth's database adapter. */
type VerificationReader = {
  findMany<T>(query: {
    model: string
    where?: { field: string; value: string }[]
    sortBy?: { field: string; direction: 'asc' | 'desc' }
    limit?: number
  }): Promise<T[]>
}

/**
 * The stored hash of the latest sign-in code for `email`, read without Better Auth's
 * findVerificationValue, which also deletes expired codes and would turn the next "expired"
 * answer into "invalid".
 */
async function latestStoredOtp(adapter: VerificationReader, email: string): Promise<string | null> {
  const [row] = await adapter.findMany<{ value: string }>({
    model: 'verification',
    where: [{ field: 'identifier', value: `sign-in-otp-${email}` }],
    sortBy: { field: 'createdAt', direction: 'desc' },
    limit: 1
  })
  if (!row) return null
  // Better Auth stores `<hash>:<attempts>`.
  const separator = row.value.lastIndexOf(':')
  return separator === -1 ? row.value : row.value.slice(0, separator)
}

const LIMITER_DOWN = 'Sign-in is unavailable right now.'

export function createAuth({ db, settings, sender, limit }: CreateAuthOptions): Auth {
  const secure = settings.useSecureCookies
  const keys = Promise.all([
    deriveKey(settings.secret, RATE_LIMIT_KEY_LABEL),
    deriveKey(settings.secret, CODE_BINDING_KEY_LABEL),
    deriveKey(settings.secret, KNOWN_DEVICE_KEY_LABEL)
  ])
  keys.catch(() => undefined)

  /** Counts the request against every rule, in order; the first refusal wins. */
  async function consume(
    rules: readonly (Rule & { subject?: string })[],
    subject: string
  ): Promise<LimitResult> {
    const [rateLimitKey] = await keys
    for (const rule of rules) {
      const bucket = await digest(rateLimitKey, rule.subject ?? subject)
      const result = await limit({
        key: `${rule.name}:${bucket}`,
        points: rule.points,
        duration: rule.duration
      })
      if (!result.allowed) return result
    }
    return { allowed: true, retryAfterMs: 0 }
  }

  /** The id of the verified account with this email, or null. */
  async function verifiedAccount(email: string): Promise<string | null> {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), eq(users.emailVerified, true)))
      .limit(1)
    return row?.id ?? null
  }

  async function standingOf(
    email: string,
    cookieHeader: string | null | undefined
  ): Promise<EmailStanding> {
    const userId = await verifiedAccount(email)
    if (!userId) return 'new'
    const [, , knownDeviceKey] = await keys
    return (await anyKnownDevice(knownDeviceKey, cookieHeader, secure, userId, new Date()))
      ? 'known-device'
      : 'member'
  }

  async function bindingFor(code: BoundCode): Promise<string> {
    const [, codeBindingKey] = await keys
    return issueCodeBinding(codeBindingKey, code, new Date())
  }

  /**
   * The binding a code request that sends nothing answers with: a fresh binding for the email's
   * current code when the browser already holds one (so its code keeps working), else a decoy.
   * Either way the response matches one that sent a code.
   */
  async function unsentBinding(
    adapter: VerificationReader,
    email: string,
    cookieHeader: string | null | undefined
  ): Promise<string> {
    const tokens = readCodeBindingTokens(cookieHeader, secure)
    const storedOtp = tokens.length > 0 ? await latestStoredOtp(adapter, email) : null
    if (storedOtp !== null) {
      const [, codeBindingKey] = await keys
      const code = { email, storedOtp }
      if (await findCodeBinding(codeBindingKey, tokens, code, new Date())) return bindingFor(code)
    }
    return decoyCodeBinding(new Date())
  }

  /** True when the request holds a binding for the email's latest code. */
  async function holdsCodeBinding(
    adapter: VerificationReader,
    email: string,
    cookieHeader: string | null | undefined
  ): Promise<boolean> {
    const tokens = readCodeBindingTokens(cookieHeader, secure)
    if (tokens.length === 0) return false
    const storedOtp = await latestStoredOtp(adapter, email)
    if (storedOtp === null) return false
    const [, codeBindingKey] = await keys
    const code = { email, storedOtp }
    return (await findCodeBinding(codeBindingKey, tokens, code, new Date())) !== null
  }

  /** Adds the known-device cookie to a successful sign-in, and clears the spent binding. */
  async function rememberDevice(response: Response): Promise<Response> {
    if (response.status !== 200) return response
    let userId: unknown
    try {
      userId = ((await response.clone().json()) as { user?: { id?: unknown } }).user?.id
    } catch {
      return response
    }
    if (typeof userId !== 'string' || !userId) return response
    const [, , knownDeviceKey] = await keys
    const token = await issueKnownDevice(knownDeviceKey, userId, new Date())
    const remembered = new Response(response.body, response)
    remembered.headers.append('set-cookie', knownDeviceSetCookie(token, secure))
    remembered.headers.append('set-cookie', clearCodeBindingSetCookie(secure))
    return remembered
  }

  const otpPlugin = emailOTP({
    otpLength: OTP_LENGTH,
    expiresIn: OTP_EXPIRES_IN_SECONDS,
    allowedAttempts: OTP_ALLOWED_ATTEMPTS,
    // Better Auth's "hashed" digest, computed here so the binding can name the stored hash.
    storeOTP: { hash: hashOtp },
    // Better Auth awaits this and swallows a failure, so the response never says whether an
    // email went out; `email` is already lowercased.
    async sendVerificationOTP({ email, otp }, ctx) {
      // Bind the code to this browser before delivery, so a failed delivery answers the same.
      ctx?.setCookie(
        codeBindingCookieName(secure),
        await bindingFor({ email, storedOtp: await hashOtp(otp) }),
        codeBindingCookieOptions(secure)
      )
      await sender.send({ email, otp, expiresInSeconds: OTP_EXPIRES_IN_SECONDS })
    }
  })
  /** Exactly Better Auth's answer to a wrong code. */
  const invalidCode = () => APIError.from('BAD_REQUEST', otpPlugin.$ERROR_CODES.INVALID_OTP)

  const instance = betterAuth({
    appName: 'SERP DR',
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
    // Scrubbed: a failed D1 query would otherwise log the email and the code's hash.
    logger: authLogger,
    // Unexpected errors (a failed D1 query) propagate to handler() below, which logs them
    // scrubbed; otherwise Better Auth's router prints the raw error, query values included.
    // API errors such as a wrong code still answer normally.
    onAPIError: { throw: true },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      // Explicit, so the origin and CSRF checks never depend on NODE_ENV (Better Auth skips
      // them under test by default).
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      useSecureCookies: secure
    },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        const headers = ctx.request?.headers
        const cookieHeader = headers?.get('cookie')
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
          const ip = clientIp(headers)
          // Per-client limits don't depend on the email, so their 429 reveals nothing.
          const client = await consume(OTP_CLIENT_RULES, ip)
          if (client.unavailable) throw unavailable('RATE_LIMITER_UNAVAILABLE', LIMITER_DOWN)
          if (!client.allowed) throw rateLimited(client.retryAfterMs)
          const email = normalizeEmail(body.email)
          const standing = await standingOf(email, cookieHeader)
          const decision = await consume(otpEmailRules(standing, email, ip), email)
          if (decision.unavailable) throw unavailable('RATE_LIMITER_UNAVAILABLE', LIMITER_DOWN)
          // Better Auth sends to the address the limits counted, not a padded variant of it that
          // it would refuse, so a padded address can't tell a limited email from an allowed one.
          if (decision.allowed) return { context: { body: { ...ctx.body, email } } }
          // A per-email limit answers exactly like a sent code, binding cookie included, and
          // sends nothing.
          ctx.setCookie(
            codeBindingCookieName(secure),
            await unsentBinding(ctx.context.adapter, email, cookieHeader),
            codeBindingCookieOptions(secure)
          )
          return ctx.json({ success: true })
        }
        if (ctx.path === SIGN_IN_OTP_PATH) {
          const body = (ctx.body ?? {}) as {
            email?: unknown
            otp?: unknown
            image?: unknown
            name?: unknown
          }
          if (body.image !== undefined || body.name !== undefined) {
            throw new APIError('BAD_REQUEST', {
              code: 'FIELD_NOT_ALLOWED',
              message: 'Only an email and a code can be sent.'
            })
          }
          const guesses = await consume(SIGN_IN_CLIENT_RULES, clientIp(headers))
          if (guesses.unavailable) throw unavailable('RATE_LIMITER_UNAVAILABLE', LIMITER_DOWN)
          if (!guesses.allowed) throw rateLimited(guesses.retryAfterMs)
          // Only the browser that requested the email's latest code may guess it, so nobody
          // else can use up its three attempts. Refused before Better Auth counts the guess,
          // with the same answer as a wrong code.
          if (typeof body.email !== 'string') return
          const email = normalizeEmail(body.email)
          if (!(await holdsCodeBinding(ctx.context.adapter, email, cookieHeader))) {
            throw invalidCode()
          }
          // Better Auth checks the code for the address the binding was checked for.
          const otp = typeof body.otp === 'string' ? codeDigits(body.otp) : body.otp
          return { context: { body: { ...ctx.body, email, otp } } }
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
      // Better Auth checks Origin only on requests that carry a cookie; every write here must
      // come from the site itself, cookie or not.
      if (
        request.method === 'POST' &&
        !settings.trustedOrigins.includes(request.headers.get('origin') ?? '')
      ) {
        return Response.json(
          { code: 'INVALID_ORIGIN', message: 'Invalid origin' },
          { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
        )
      }
      let response: Response
      try {
        const capped = await withCappedBody(request, MAX_AUTH_BODY_BYTES)
        if (!capped) {
          return Response.json(
            { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' },
            { status: 413, headers: { 'Cache-Control': 'private, no-store' } }
          )
        }
        response = await instance.handler(capped)
      } catch (error) {
        authLogger.log('error', 'request failed', error)
        return Response.json(
          { code: 'AUTH_FAILED', message: 'Sign-in failed. Try again shortly.' },
          { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
        )
      }
      if (path === GET_SESSION_PATH) return withoutSessionToken(response)
      if (path === SIGN_IN_OTP_PATH) return rememberDevice(await withoutSessionToken(response))
      return response
    },
    routes
  }
}
