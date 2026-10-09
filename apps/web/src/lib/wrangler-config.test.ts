// Resolves each deployed environment the way Wrangler does and checks what it must carry. Named
// environments don't inherit the top level's bindings, services or vars, so a key left out of one
// would deploy without it. Standards: environment-configuration.md, nextjs-on-workers.md.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { unstable_readConfig } from 'wrangler'

const ROOT = path.resolve(__dirname, '../..')
const CONFIG = path.join(ROOT, 'wrangler.jsonc')
const CANONICAL = {
  staging: 'https://staging-dr.serp.co',
  production: 'https://dr.serp.co'
} as const

function read(env?: string) {
  return unstable_readConfig({ config: CONFIG, env })
}

describe('wrangler.jsonc', () => {
  const local = read()

  for (const [env, canonical] of Object.entries(CANONICAL)) {
    describe(env, () => {
      const config = read(env)

      it('runs worker.ts with the standard flags, source maps and logs', () => {
        expect(config.main).toBe(path.join(ROOT, 'worker.ts'))
        expect(config.compatibility_flags).toEqual(
          expect.arrayContaining(['nodejs_compat', 'global_fetch_strictly_public'])
        )
        expect(config.upload_source_maps).toBe(true)
        expect(config.observability?.enabled).toBe(true)
        // keep_names would put __name() into next-themes' inline script (#130).
        expect(config.keep_names).toBe(false)
      })

      it('has its own D1, rate limiter and self-reference bindings', () => {
        expect(config.d1_databases).toEqual([
          expect.objectContaining({
            binding: 'DB',
            migrations_dir: 'drizzle',
            migrations_table: 'd1_migrations'
          })
        ])
        expect(config.d1_databases[0].database_id).not.toBe(local.d1_databases[0].database_id)
        expect(
          config.durable_objects.bindings.map((binding: { name: string }) => binding.name)
        ).toEqual(['RATE_LIMITER'])
        expect(config.services).toEqual([
          { binding: 'WORKER_SELF_REFERENCE', service: config.name }
        ])
      })

      it('sets every var and requires every secret', () => {
        expect(Object.keys(config.vars).sort()).toEqual(
          [
            'BETTER_AUTH_URL',
            'DR_BADGE_BASE_URL',
            'DR_PUBLIC_BASE_URL',
            'NEXTJS_ENV',
            'SITE_ENV',
            'STRIPE_PORTAL_CONFIGURATION_ID'
          ].sort()
        )
        expect(config.vars.SITE_ENV).toBe(env)
        expect(config.vars.DR_PUBLIC_BASE_URL).toBe(canonical)
        expect(config.vars.DR_BADGE_BASE_URL).toBe(canonical)
        expect(config.vars.BETTER_AUTH_URL).toBe(canonical)
        expect(config.secrets?.required?.slice().sort()).toEqual(
          local.secrets?.required?.slice().sort()
        )
      })

      it('serves one canonical custom domain, keeps workers.dev for CI and turns preview URLs off', () => {
        expect(config.routes).toEqual([{ pattern: new URL(canonical).host, custom_domain: true }])
        expect(config.workers_dev).toBe(true)
        expect(config.preview_urls).toBe(false)
      })
    })
  }

  it('keeps the top level local: no routes and no platform hosts', () => {
    expect(local.routes ?? []).toEqual([])
    expect(local.workers_dev).toBe(false)
    expect(local.preview_urls).toBe(false)
  })

  it('passes --env to every remote command in package.json', () => {
    const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const remote =
      /(wrangler (deploy|versions|rollback|secret)|opennextjs-cloudflare (deploy|upload)|--remote)/
    const commands = Object.values(scripts)
      .flatMap(script => script.split('&&').map(command => command.trim()))
      .filter(command => remote.test(command))

    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) expect(command).toMatch(/--env[= ](staging|production)\b/)
  })
})
