// The real Better Auth configuration against a Wrangler-migrated local D1: only the four
// endpoints the site uses answer, a code signs in, limits hold, and no answer says whether an
// email has an account. Origin and CSRF checks stay on (config.ts forces them under test).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbFrom } from '@/db/client'
import { type LocalD1, openMigratedLocalD1 } from '@/db/local-d1'
import {
  SIGN_IN_CODE_ATTEMPTS,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_CODE_TTL_SECONDS
} from '@/lib/sign-in-code'
import { clientIp } from './client-ip'
import { CODE_BINDING_COOKIE } from './code-binding'
import {
  ALLOWED_AUTH_ENDPOINTS,
  type Auth,
  createAuth,
  type LimitRule,
  MAX_AUTH_BODY_BYTES,
  OTP_ALLOWED_ATTEMPTS,
  SEND_OTP_PATH,
  SIGN_IN_OTP_PATH
} from './config'
import { hasSessionCookie } from './cookies'
import { KNOWN_DEVICE_COOKIE } from './known-device'
import type { CodeSender, SignInCode } from './sender'
import { signInEmail } from './sender'

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

/** Every rule the limiter was asked to count, in order. */
const calls: LimitRule[] = []

async function limit(rule: LimitRule) {
  calls.push(rule)
  const { key, points } = rule
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
  calls.length = 0
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

/** Merges Set-Cookie values into a Cookie header, the way a browser keeps them. */
function jar(existing: string, response: Response): string {
  const cookies = new Map(
    existing
      .split('; ')
      .filter(Boolean)
      .map(pair => [pair.split('=')[0], pair] as const)
  )
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(';')[0] ?? ''
    const name = pair.split('=')[0] ?? ''
    if (/Max-Age=0/i.test(header)) cookies.delete(name)
    else cookies.set(name, pair)
  }
  return [...cookies.values()].join('; ')
}

async function requestCode(email: string, ip: string, cookie = '') {
  const before = sent.length
  const response = await post(SEND_OTP_PATH, { email, type: 'sign-in' }, { ip, cookie })
  return {
    response,
    code: sent.length > before ? sent.at(-1)?.otp : undefined,
    cookie: jar(cookie, response)
  }
}

/** Signs `email` in from a fresh client; the browser's cookies after (session, known device). */
async function signedIn(email: string): Promise<string> {
  const ip = nextClient()
  const { code, cookie } = await requestCode(email, ip)
  const signIn = await post(SIGN_IN_OTP_PATH, { email, otp: code }, { ip, cookie })
  expect(signIn.status).toBe(200)
  return jar(cookie, signIn)
}

/** The rules counted while `action` ran. */
async function countedDuring(action: () => Promise<unknown>): Promise<LimitRule[]> {
  const from = calls.length
  await action()
  return calls.slice(from)
}

const ruleName = (rule: LimitRule) => rule.key.split(':')[0]

/** The counted rule named `name`; fails the test when it wasn't counted. */
function counted(rules: LimitRule[], name: string): LimitRule {
  const rule = rules.find(candidate => ruleName(candidate) === name)
  if (!rule) throw new Error(`${name} was not counted: ${rules.map(ruleName).join(', ')}`)
  return rule
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
    const { response, code, cookie: bound } = await requestCode('New.Person@Example.com', ip)
    expect(response.status).toBe(200)
    expect(sent.at(-1)?.email).toBe('new.person@example.com')
    expect(code).toMatch(/^\d{6}$/)

    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'new.person@example.com', otp: code },
      { ip, cookie: bound }
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
    const { code, cookie: bound } = await requestCode('spaced@example.com', ip)
    const spaced = `${code?.slice(0, 3)} ${code?.slice(3)}`
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'spaced@example.com', otp: spaced },
      { ip, cookie: bound }
    )
    expect(signIn.status).toBe(200)
  })

  it(`allows ${SIGN_IN_CODE_ATTEMPTS} wrong guesses, then the code is spent`, async () => {
    const ip = nextClient()
    const { code, cookie } = await requestCode('guesser@example.com', ip)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let attempt = 0; attempt < SIGN_IN_CODE_ATTEMPTS; attempt++) {
      const guess = await post(
        SIGN_IN_OTP_PATH,
        { email: 'guesser@example.com', otp: wrong },
        { ip, cookie }
      )
      expect(guess.status).toBe(400)
      expect(await guess.json()).toMatchObject({ code: 'INVALID_OTP' })
    }
    // Even the right code, from the browser that asked, is refused once the guesses are spent.
    const late = await post(
      SIGN_IN_OTP_PATH,
      { email: 'guesser@example.com', otp: code },
      { ip, cookie }
    )
    expect(late.status).toBe(403)
    expect(await late.json()).toMatchObject({ code: 'TOO_MANY_ATTEMPTS' })
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

  it('takes writes only from the site, cookie or not', async () => {
    const response = await post(
      SIGN_IN_OTP_PATH,
      { email: 'origin@example.com', otp: '123456' },
      { ip: nextClient(), origin: 'https://evil.serp.co' }
    )
    expect(response.status).toBe(403)
    const missing = await auth.handler(
      new Request(`${ORIGIN}/api/auth${SIGN_IN_OTP_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'origin@example.com', otp: '123456' })
      })
    )
    expect(missing.status).toBe(403)
  })

  it('refuses a body over the cap before Better Auth reads it, by its length or as it streams', async () => {
    const send = (body: string, contentLength: number) =>
      auth.handler(
        new Request(`${ORIGIN}/api/auth${SEND_OTP_PATH}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(contentLength),
            Origin: ORIGIN,
            'cf-connecting-ip': nextClient()
          },
          body
        })
      )
    // A Content-Length over the cap is refused without reading the (small) body...
    const small = JSON.stringify({ email: 'sized@example.com', type: 'sign-in' })
    const sized = await send(small, MAX_AUTH_BODY_BYTES + 1)
    expect(sized.status).toBe(413)
    expect(sent).toHaveLength(0)
    // ...and an honest one, as every browser sends, is served.
    const honest = await send(small, new TextEncoder().encode(small).length)
    expect(honest.status).toBe(200)
    expect(sent).toHaveLength(1)
    sent.length = 0

    const padding = 'x'.repeat(MAX_AUTH_BODY_BYTES)
    const bytes = new TextEncoder().encode(
      JSON.stringify({ email: 'big@example.com', type: 'sign-in', padding })
    )
    const chunked = await auth.handler(
      new Request(`${ORIGIN}/api/auth${SEND_OTP_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: ORIGIN,
          'cf-connecting-ip': nextClient()
        },
        body: new ReadableStream({
          start(controller) {
            for (let at = 0; at < bytes.length; at += 4096)
              controller.enqueue(bytes.slice(at, at + 4096))
            controller.close()
          }
        }),
        duplex: 'half'
      } as RequestInit)
    )
    expect(chunked.status).toBe(413)
    expect(sent).toHaveLength(0)
  })

  it("takes a request from another fetch implementation, as OpenNext's route handlers pass", async () => {
    const real = new Request(`${ORIGIN}/api/auth${SEND_OTP_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'cf-connecting-ip': nextClient()
      },
      body: JSON.stringify({ email: 'foreign@example.com', type: 'sign-in' })
    })
    // Not a Request to this runtime: only its parts can be read.
    const foreign = { url: real.url, method: real.method, headers: real.headers, body: real.body }
    const response = await auth.handler(foreign as Request)
    expect(response.status).toBe(200)
    expect(sent.at(-1)?.email).toBe('foreign@example.com')
  })

  it('limits code guesses per client, with 429 and Retry-After', async () => {
    const ip = nextClient()
    for (let guess = 0; guess < 10; guess++) {
      const response = await post(
        SIGN_IN_OTP_PATH,
        { email: `guess-${guess}@example.com`, otp: '123456' },
        { ip }
      )
      expect(response.status).toBe(400)
    }
    const refused = await post(
      SIGN_IN_OTP_PATH,
      { email: 'guess-10@example.com', otp: '123456' },
      { ip }
    )
    expect(refused.status).toBe(429)
    expect(refused.headers.get('Retry-After')).toBe('42')
  })

  it('never shows scripts the session token in the sign-in answer', async () => {
    const ip = nextClient()
    const { code, cookie } = await requestCode('tokenless@example.com', ip)
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'tokenless@example.com', otp: code },
      { ip, cookie }
    )
    expect(signIn.status).toBe(200)
    const body = (await signIn.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty('token')
    expect(body).toHaveProperty('user')
  })
})

describe('when D1 fails', () => {
  it('logs neither the email, the code, the session token nor the query', async () => {
    // A real session, signed with the same secret, so its token reaches the failing D1.
    const ip = nextClient()
    const { code, cookie: bound } = await requestCode('signed.in@example.com', ip)
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'signed.in@example.com', otp: code },
      { ip, cookie: bound }
    )
    const cookie = cookiesFrom(signIn)
    const token =
      decodeURIComponent(/session_token=([^;]+)/.exec(cookie)?.[1] ?? '').split('.')[0] ?? ''
    expect(token.length).toBeGreaterThan(10)

    // A binding whose every statement fails, like a transient D1 error or a missing migration.
    const fail = () => Promise.reject(new Error('D1_ERROR: no such table: verification'))
    const statement = { bind: () => statement, all: fail, run: fail, first: fail, raw: fail }
    const broken = { prepare: () => statement, batch: fail, exec: fail } as unknown as D1Database
    const failing = createAuth({ db: dbFrom(broken), settings, sender, limit })

    const logged: string[] = []
    const spies = (['error', 'warn', 'info', 'log', 'debug'] as const).map(level =>
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(
          args
            .map(arg =>
              arg instanceof Error ? `${arg.message} ${String(arg.cause)}` : String(arg)
            )
            .join(' ')
        )
      })
    )
    try {
      for (const [path, body] of [
        [SEND_OTP_PATH, { email: 'victim@example.com', type: 'sign-in' }],
        [SIGN_IN_OTP_PATH, { email: 'victim@example.com', otp: '123456' }]
      ] as const) {
        const response = await failing.handler(
          new Request(`${ORIGIN}/api/auth${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: ORIGIN,
              'cf-connecting-ip': nextClient()
            },
            body: JSON.stringify(body)
          })
        )
        expect(response.status).toBeGreaterThanOrEqual(400)
      }
      const session = await failing.handler(
        new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie, Origin: ORIGIN } })
      )
      // 500 means the signed cookie verified and the lookup reached the failing D1.
      expect(session.status).toBe(500)
      expect(await session.text()).not.toContain(token)
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
    expect(logged.length).toBeGreaterThan(0)
    const text = logged.join('\n')
    expect(text).not.toContain('victim@example.com')
    expect(text).not.toContain('signed.in@example.com')
    expect(text).not.toContain(token)
    expect(text).not.toContain('Failed query')
    expect(text).not.toContain('params')
  })
})

describe('codes bound to the browser that asked (#135)', () => {
  it('refuses a guess without the binding before it counts, so the owner keeps all three', async () => {
    const owner = nextClient()
    const { code, cookie } = await requestCode('bound@example.com', owner)
    const wrong = code === '000000' ? '111111' : '000000'
    // Someone else, without the binding, guesses (even the right code) and is refused...
    for (let attempt = 0; attempt < OTP_ALLOWED_ATTEMPTS + 2; attempt++) {
      const stranger = await post(
        SIGN_IN_OTP_PATH,
        { email: 'bound@example.com', otp: attempt === 0 ? code : wrong },
        { ip: nextClient() }
      )
      expect(stranger.status).toBe(400)
      expect(await stranger.json()).toMatchObject({ code: 'INVALID_OTP' })
    }
    // ...and the owner's browser still signs in with the code.
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'bound@example.com', otp: code },
      { ip: owner, cookie }
    )
    expect(signIn.status).toBe(200)
  })

  it('hands a limited request a decoy, and leaves the first binding working', async () => {
    const first = await requestCode('replaced@example.com', nextClient())
    const second = await requestCode('replaced@example.com', nextClient())
    // The per-email limit holds the second request, so it sent nothing and handed out a decoy.
    expect(second.code).toBeUndefined()
    expect(second.cookie).toContain(`__Secure-${CODE_BINDING_COOKIE}=`)
    const decoy = await post(
      SIGN_IN_OTP_PATH,
      { email: 'replaced@example.com', otp: first.code },
      { ip: nextClient(), cookie: second.cookie }
    )
    expect(decoy.status).toBe(400)
    // The first browser's binding still matches the latest code.
    const owner = await post(
      SIGN_IN_OTP_PATH,
      { email: 'replaced@example.com', otp: first.code },
      { ip: nextClient(), cookie: first.cookie }
    )
    expect(owner.status).toBe(200)
  })

  it("lets a newer code, from any browser, replace the first browser's binding", async () => {
    await signedIn('rebound@example.com')
    // A member gets a code per email and client, so a second browser's request is really sent.
    const first = await requestCode('rebound@example.com', nextClient())
    const second = await requestCode('rebound@example.com', nextClient())
    expect(first.code).toBeDefined()
    expect(second.code).toBeDefined()
    // The first browser's binding named the replaced code, so even the new code is refused there...
    const stale = await post(
      SIGN_IN_OTP_PATH,
      { email: 'rebound@example.com', otp: second.code },
      { ip: nextClient(), cookie: first.cookie }
    )
    expect(stale.status).toBe(400)
    expect(await stale.json()).toMatchObject({ code: 'INVALID_OTP' })
    // ...and the second browser signs in with it.
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'rebound@example.com', otp: second.code },
      { ip: nextClient(), cookie: second.cookie }
    )
    expect(signIn.status).toBe(200)
  })

  it('sets the binding cookie HttpOnly, Secure, SameSite=Strict, on /api/auth, for 15 minutes', async () => {
    const { response } = await requestCode('attributes@example.com', nextClient())
    const binding = response.headers
      .getSetCookie()
      .find(header => header.startsWith(`__Secure-${CODE_BINDING_COOKIE}=`))
    expect(binding).toBeDefined()
    const attributes = (binding ?? '')
      .split('; ')
      .slice(1)
      .map(part => part.toLowerCase())
    expect(attributes).toEqual(
      expect.arrayContaining([
        `max-age=${SIGN_IN_CODE_TTL_SECONDS + 5 * 60}`,
        'path=/api/auth',
        'httponly',
        'secure',
        'samesite=strict'
      ])
    )
    expect(attributes.some(part => part.startsWith('domain='))).toBe(false)
  })

  it('checks every same-named cookie, so a planted one ahead of the real one changes nothing', async () => {
    const ip = nextClient()
    const { code, cookie } = await requestCode('planted@example.com', ip)
    const planted = `__Secure-${CODE_BINDING_COOKIE}=1.${'A'.repeat(43)}; ${cookie}`
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'planted@example.com', otp: code },
      { ip, cookie: planted }
    )
    expect(signIn.status).toBe(200)
    const device = jar(cookie, signIn)
    const bogusDevice = `__Secure-${KNOWN_DEVICE_COOKIE}=bogus.value; ${device}`
    const rules = await countedDuring(() =>
      requestCode('planted@example.com', nextClient(), bogusDevice)
    )
    expect(rules.map(ruleName)).toContain('otp-known-device-hour')
  })

  it('remembers the device after sign-in and clears the spent binding', async () => {
    const ip = nextClient()
    const { code, cookie } = await requestCode('device@example.com', ip)
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'device@example.com', otp: code },
      { ip, cookie }
    )
    const set = signIn.headers.getSetCookie()
    const knownDevice = set.find(header => header.startsWith(`__Secure-${KNOWN_DEVICE_COOKIE}=`))
    expect(knownDevice).toMatch(
      /Max-Age=15552000; Path=\/api\/auth; HttpOnly; SameSite=Strict; Secure/
    )
    expect(set.some(header => header.startsWith(`__Secure-${CODE_BINDING_COOKIE}=;`))).toBe(true)
  })

  it("keeps a member's own browser able to get a code while others flood the email", async () => {
    const home = nextClient()
    const first = await requestCode('flooded@example.com', home)
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'flooded@example.com', otp: first.code },
      { ip: home, cookie: first.cookie }
    )
    const device = jar(first.cookie, signIn)
    // 25 requests from 25 other addresses use up the member's 20 an hour...
    for (let index = 0; index < 25; index++) await requestCode('flooded@example.com', nextClient())
    sent.length = 0
    expect((await requestCode('flooded@example.com', nextClient())).code).toBeUndefined()
    // ...another account's known-device cookie gives no way around that...
    const otherDevice = await signedIn('other.member@example.com')
    expect(
      (await requestCode('flooded@example.com', nextClient(), otherDevice)).code
    ).toBeUndefined()
    // ...but the browser with the account's own known-device cookie spends its own budget.
    const own = await requestCode('flooded@example.com', nextClient(), device)
    expect(own.code).toMatch(/^\d{6}$/)
  })
})

describe('limits (#135)', () => {
  it('keys every limit by an HMAC digest, never a raw email or IP', async () => {
    const ip = nextClient()
    const rules = await countedDuring(async () => {
      const { code, cookie } = await requestCode('digest.person@example.com', ip)
      await post(
        SIGN_IN_OTP_PATH,
        { email: 'digest.person@example.com', otp: code },
        { ip, cookie }
      )
    })
    expect(rules.map(ruleName)).toEqual(
      expect.arrayContaining(['otp-client-minute', 'otp-email-minute', 'sign-in-client-minute'])
    )
    for (const { key } of rules) {
      expect(key).toMatch(/^[a-z-]+:[0-9a-f]{32}$/)
      expect(key).not.toContain('digest.person')
      expect(key).not.toContain(ip)
    }
  })

  it('caps guesses at 60 an hour per client as well as 10 a minute', async () => {
    const ip = nextClient()
    const rules = await countedDuring(() =>
      post(SIGN_IN_OTP_PATH, { email: 'hourly@example.com', otp: '123456' }, { ip })
    )
    expect(counted(rules, 'sign-in-client-minute')).toMatchObject({ points: 10, duration: 60 })
    const hour = counted(rules, 'sign-in-client-hour')
    expect(hour).toMatchObject({ points: 60, duration: 3600 })
    counts.set(hour.key, 60)
    const refused = await post(
      SIGN_IN_OTP_PATH,
      { email: 'hourly@example.com', otp: '123456' },
      { ip }
    )
    expect(refused.status).toBe(429)
    expect(refused.headers.get('Retry-After')).toBe('42')
  })

  it('caps code requests for new emails at 300 an hour site-wide, answered like a sent code', async () => {
    const first = await countedDuring(() => requestCode('site-cap-1@example.com', nextClient()))
    const second = await countedDuring(() => requestCode('site-cap-2@example.com', nextClient()))
    const site = counted(first, 'otp-site-hour')
    expect(site).toMatchObject({ points: 300, duration: 3600 })
    // One bucket for every new email.
    expect(counted(second, 'otp-site-hour').key).toBe(site.key)
    const member = await signedIn('site-cap-member@example.com')
    counts.set(site.key, 300)
    sent.length = 0
    const capped = await requestCode('site-cap-3@example.com', nextClient())
    expect(capped.response.status).toBe(200)
    expect(await capped.response.json()).toEqual({ success: true })
    expect(capped.cookie).toContain(`__Secure-${CODE_BINDING_COOKIE}=`)
    expect(sent).toHaveLength(0)
    // Members don't spend it: their own browsers and others still get codes.
    expect((await requestCode('site-cap-member@example.com', nextClient())).code).toBeDefined()
    expect(
      (await requestCode('site-cap-member@example.com', nextClient(), member)).code
    ).toBeDefined()
  })

  it("gives a member's known device 10 codes an hour of its own", async () => {
    const device = await signedIn('own-budget@example.com')
    const rules = await countedDuring(() =>
      requestCode('own-budget@example.com', nextClient(), device)
    )
    expect(rules.map(ruleName)).not.toContain('otp-member-hour')
    const own = counted(rules, 'otp-known-device-hour')
    expect(own).toMatchObject({ points: 10, duration: 3600 })
    counts.set(own.key, 10)
    sent.length = 0
    const refused = await requestCode('own-budget@example.com', nextClient(), device)
    expect(refused.response.status).toBe(200)
    expect(sent).toHaveLength(0)
  })

  it('counts a padded address as the address itself, so answers match for members and new emails', async () => {
    await signedIn('padded.member@example.com')
    const answers = async (email: string) => {
      const statuses: number[] = []
      for (let index = 0; index < 2; index++) {
        const { response } = await requestCode(` ${email} `, nextClient())
        statuses.push(response.status)
      }
      return statuses
    }
    expect(await answers('padded.member@example.com')).toEqual([200, 200])
    expect(await answers('padded.new@example.com')).toEqual([200, 200])
    // The code goes to the trimmed address, and a padded sign-in uses it too.
    sent.length = 0
    const ip = nextClient()
    const { code, cookie } = await requestCode('  padded.later@example.com', ip)
    expect(sent.at(-1)?.email).toBe('padded.later@example.com')
    const signIn = await post(
      SIGN_IN_OTP_PATH,
      { email: 'padded.later@example.com  ', otp: code },
      { ip, cookie }
    )
    expect(signIn.status).toBe(200)
  })
})

describe('client address', () => {
  const headers = (values: Record<string, string>) => new Headers(values)

  it('counts IPv4 as is, IPv6 by its /64, and IPv4-mapped IPv6 as IPv4', () => {
    expect(clientIp(headers({ 'cf-connecting-ip': '198.51.100.7' }))).toBe('198.51.100.7')
    expect(clientIp(headers({ 'cf-connecting-ip': '2001:db8:1:2:3:4:5:6' }))).toBe(
      '2001:db8:1:2::/64'
    )
    expect(clientIp(headers({ 'cf-connecting-ip': '::ffff:198.51.100.7' }))).toBe('198.51.100.7')
    expect(clientIp(headers({ 'cf-connecting-ip': 'not an ip' }))).toBe('unknown')
    expect(clientIp(headers({}))).toBe('unknown')
  })

  it('puts compressed forms of one /64 in one bucket', () => {
    const of = (ip: string) => clientIp(headers({ 'cf-connecting-ip': ip }))
    expect(of('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(of('2001:db8::2')).toBe(of('2001:db8::1'))
    expect(of('2001:db8::1:2:3:4')).toBe(of('2001:db8::5:2:3:4'))
    expect(of('2001:db8:1::5')).toBe(of('2001:db8:1:0:1::5'))
    expect(of('2001:DB8:1:0:1::5')).toBe(of('2001:db8:1::5'))
    expect(of('2001:db8:1:2::5')).not.toBe(of('2001:db8:1:3::5'))
  })

  it('never reads an address the client could pick itself', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '198.51.100.9' }))).toBe('unknown')
    expect(
      clientIp(headers({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '198.51.100.9' }))
    ).toBe('198.51.100.7')
  })

  it('trusts cf-connecting-ipv6 only behind a Class E pseudo IPv4 address', () => {
    expect(
      clientIp(headers({ 'cf-connecting-ip': '198.51.100.7', 'cf-connecting-ipv6': '2001:db8::1' }))
    ).toBe('198.51.100.7')
    expect(
      clientIp(
        headers({ 'cf-connecting-ip': '245.1.2.3', 'cf-connecting-ipv6': '2001:db8:9:9::1' })
      )
    ).toBe('2001:db8:9:9::/64')
  })
})

describe('the code is defined once', () => {
  // The attempts are pinned by "allows N wrong guesses" above, through the real flow.
  it('sends a code of the shared length, with the shared lifetime in the email', async () => {
    await requestCode('shape@example.com', nextClient())
    const code = sent.at(-1)
    expect(code?.otp).toMatch(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`))
    expect(code?.expiresInSeconds).toBe(SIGN_IN_CODE_TTL_SECONDS)
    const { text } = signInEmail(code as SignInCode, 'https://dr.serp.co')
    expect(text).toContain(`expires in ${SIGN_IN_CODE_TTL_SECONDS / 60} minutes`)
  })
})
