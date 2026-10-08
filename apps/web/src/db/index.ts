// The data layer's entry point for the site: a Drizzle client over this request's D1 binding.
import 'server-only'

import { getCloudflareContext } from '@opennextjs/cloudflare'

import { type Db, dbFrom } from './client'

export type { Db } from './client'

// Reads env.DB per request, never at module scope (environment-configuration.md).
export async function getDb(): Promise<Db> {
  const { env } = await getCloudflareContext({ async: true })
  return dbFrom(env.DB)
}
