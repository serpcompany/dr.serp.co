// The real Better Auth configuration against a Wrangler-migrated local D1: only the four
// endpoints the site uses answer, a code signs in, limits hold, and no answer says whether an
// email has an account. Origin and CSRF checks stay on (config.ts forces them under test).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { dbFrom } from '@/db/client'
import { type LocalD1, openMigratedLocalD1 } from '@/db/local-d1'
import {
  ALLOWED_AUTH_ENDPOINTS,
  type Auth,
  createAuth,
  type LimitRule,
  OTP_ALLOWED_ATTEMPTS,
  SEND_OTP_PATH,
  SIGN_IN_OTP_PATH
} from './config'
import { hasSessionCookie } from './cookies'
import type { CodeSender, SignInCode } from './sender'

const ORIGIN = 'https://dr.serp.co'
const settings = {
  environment: 'production' as const,
  secret: 'a-test-secret-that-is-at-least-32-characters',
  baseURL: ORIGIN,
  trustedOrigins: [ORIGIN],
  useSecureCookies: true
}

let d1: LocalD1
let dispose: () => Promise<void>
const sent: SignInCode[] = []
let senderReady = true
let limiterDown = false
const counts = new Map<string, number>()

const sender: CodeSender = {
  ready: () => senderReady,
  async send(code) {
    sent.push(code)
  }
}

async function limit({ key, points }: LimitRule) {
  if (limiterDown) return { allowed: false, unavailable: true, retryAfterMs: 60_000 }
  const used = (counts.get(key) ?? 0) + 1
  if (used > points) return { allowed: false, retryAfterMs: 42_000 }
  counts.set(key, used)
  return { allowed: true, retryAfterMs: 0 }
}

let auth: Auth

beforeAll(async () => {
  ;({ d1, dispose } = await openMigratedLocalD1())
  auth = createAuth({ db: dbFrom(d1 as unknown as D1Database), settings, sender, limit })
}, 60_000)

afterAll(async () => {
  await dispose?.()
})

beforeEach(() => {
  sent.length = 0
  senderReady = true
  limiterDown = false
  counts.clear()
})

let client = 0
/** Each test talks from its own address, so per-client limits don't leak between tests. */
function nextClient() {
  client += 1
  return `203.0.113.${client}`
}

function post(
  path: string,
  body: unknown,
  { ip = '198.51.100.1', origin = ORIGIN, cookie = '' } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Origin: origin,
    'cf-connecting-ip': ip
  }
  if (cookie) headers.cookie = cookie
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  )
}

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map(cookie => cookie.split(';')[0])
    .join('; ')
}

async function requestCode(email: string, ip: string) {
  const response = await post(SEND_OTP_PATH, { email, type: 'sign-in' }, { ip })
  return { response, code: sent.at(-1)?.otp }
}

describe('Better Auth on D1', () => {
  it('serves only the four endpoints the site uses, and 404s every other one', async () => {
    const allowed = new Set(
      ALLOWED_AUTH_ENDPOINTS.map(endpoint => `${endpoint.method} ${endpoint.path}`)
    )
    const others = auth.routes.flatMap(route =>
      route.methods
        .filter(method => method === 'GET' || method === 'POST')
        .map(method => ({ method, path: route.path }))
    )
    // The allowlist names real Better Auth routes...
    for (const name of allowed) {
      expect(
        others.some(route => `${route.method} ${route.path}` === name),
        name
      ).toBe(true)
    }
    // ...and every other route answers 404 before Better Auth sees it.
    const hidden = others.filter(route => !allowed.has(`${route.method} ${route.path}`))
    expect(hidden.length).toBeGreaterThan(10)
    for (const route of hidden) {
      const response = await auth.handler(
        new Request(`${ORIGIN}/api/auth${route.path}`, {
          method: route.method,
          headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
          body: route.method === 'POST' ? '{}' : undefined
        })
      )
      expect(response.status, `${route.method} ${route.path}`).toBe(404)
    }
  })

  it('signs in with an emailed code, keeps the session, and signs out', async () => {
    const ip = nextClient()
    const { response, code } = await requestCode('New.Person@Example.com', ip)
    expect(response.status).toBe(200)
    expect(sent.at(-1)?.email).toBe('new.person@example.com')
    expect(code).toMatch(/^\d{6}$/)

    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'new.person@example.com', otp: code },
      { ip }
    )
    expect(signIn.status).toBe(200)
    const cookie = cookiesFrom(signIn)
    expect(hasSessionCookie(cookie)).toBe(true)

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user).toMatchObject({ email: 'new.person@example.com', emailVerified: true })

    // Over HTTP, get-session never shows scripts the session token (the HttpOnly cookie's value).
    const overHttp = await auth.handler(
      new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie, Origin: ORIGIN } })
    )
    const body = (await overHttp.json()) as {
      session: Record<string, unknown>
      user: { email: string }
    }
    expect(body.user.email).toBe('new.person@example.com')
    expect(body.session).not.toHaveProperty('token')
    expect(JSON.stringify(body)).not.toContain(
      decodeURIComponent(cookie.split('=')[1]).split('.')[0]
    )

    const signOut = await post('/sign-out', {}, { ip, cookie })
    expect(signOut.status).toBe(200)
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('takes a code pasted as "482 913"', async () => {
    const ip = nextClient()
    const { code } = await requestCode('spaced@example.com', ip)
    const spaced = `${code?.slice(0, 3)} ${code?.slice(3)}`
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'spaced@example.com', otp: spaced },
      { ip }
    )
    expect(signIn.status).toBe(200)
  })

  it(`allows ${OTP_ALLOWED_ATTEMPTS} wrong guesses, then the code is spent`, async () => {
    const ip = nextClient()
    const { code } = await requestCode('guesser@example.com', ip)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < OTP_ALLOWED_ATTEMPTS; attempt++) {
      const guess = await post(
        SIGN_IN_OTP_PATH,
        { email: 'guesser@example.com', otp: wrong },
        { ip }
      )
      expect(guess.status).toBe(400)
    }
    const late = await post(SIGN_IN_OTP_PATH, { email: 'guesser@example.com', otp: code }, { ip })
    expect(late.status).not.toBe(200)
  })

  it('refuses a code request from a foreign Origin', async () => {
    const response = await post(
      SEND_OTP_PATH,
      { email: 'csrf@example.com', type: 'sign-in' },
      { ip: nextClient(), origin: 'https://evil.serp.co' }
    )
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('answers a per-email limit exactly like a sent code, and sends nothing', async () => {
    const first = await requestCode('limited@example.com', nextClient())
    const second = await requestCode('limited@example.com', nextClient())
    expect(first.response.status).toBe(200)
    expect(second.response.status).toBe(200)
    expect(await second.response.json()).toEqual(await first.response.clone().json())
    expect(sent).toHaveLength(1)
  })

  it('answers a per-client limit with 429 and Retry-After', async () => {
    const ip = nextClient()
    for (let index = 0; index < 5; index++) {
      expect((await requestCode(`client-${index}@example.com`, ip)).response.status).toBe(200)
    }
    const refused = await requestCode('client-5@example.com', ip)
    expect(refused.response.status).toBe(429)
    expect(refused.response.headers.get('Retry-After')).toBe('42')
  })

  it("answers 503 before creating a code when email can't be sent, or the limiter is down", async () => {
    senderReady = false
    const noMail = await requestCode('nomail@example.com', nextClient())
    expect(noMail.response.status).toBe(503)
    expect(await noMail.response.json()).toMatchObject({ code: 'OTP_DELIVERY_UNAVAILABLE' })

    senderReady = true
    limiterDown = true
    const noLimiter = await requestCode('nolimiter@example.com', nextClient())
    expect(noLimiter.response.status).toBe(503)
    expect(sent).toHaveLength(0)
  })

  it('refuses other code types and extra sign-in fields', async () => {
    const ip = nextClient()
    const verify = await post(
      SEND_OTP_PATH,
      { email: 'type@example.com', type: 'email-verification' },
      { ip }
    )
    expect(verify.status).toBe(400)
    const named = await post(
      SIGN_IN_OTP_PATH,
      { email: 'type@example.com', otp: '123456', name: 'x' },
      { ip }
    )
    expect(named.status).toBe(400)
  })
})
