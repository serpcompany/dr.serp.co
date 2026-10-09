// The site's Better Auth instance, built per request from this request's bindings and
// environment (never at module scope: `next build` has none), and cached per D1 binding.
import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'

import { dbFrom } from '@/db/client'
import { checkRateLimit } from '@/server/rate-limit.mjs'
import { type Auth, createAuth } from './config'
import { codeSenderFor } from './sender'
import { readAuthSettings } from './settings'

const instances = new WeakMap<object, { key: string; auth: Auth }>()

export type AuthLookup = { ok: true; auth: Auth } | { ok: false; problem: string }

export async function getAuth(): Promise<AuthLookup> {
  const read = readAuthSettings(process.env)
  if (!read.ok) return read
  const { env } = await getCloudflareContext({ async: true })
  const { settings } = read
  // A changed secret or URL (a new deploy) builds a new instance.
  const key = `${settings.baseURL}\u0000${settings.secret}`
  const cached = instances.get(env.DB)
  if (cached?.key === key) return { ok: true, auth: cached.auth }
  const auth = createAuth({
    db: dbFrom(env.DB),
    settings,
    sender: codeSenderFor(settings.environment, process.env, settings.baseURL),
    limit: checkRateLimit
  })
  instances.set(env.DB, { key, auth })
  return { ok: true, auth }
}
