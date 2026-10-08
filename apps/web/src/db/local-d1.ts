// Test support: a local D1 database with every migration in drizzle/ applied by Wrangler itself
// (the same engine and d1_migrations ledger as Staging and Production), in a temporary directory.
// Not imported by the site.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { getPlatformProxy } from 'wrangler'

const ROOT = path.resolve(__dirname, '../..')

export type LocalD1 = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>
      all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>
    }
    all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>
  }
  batch: (statements: unknown[]) => Promise<unknown>
}

export async function openMigratedLocalD1() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dr-serp-d1-'))
  try {
    const wranglerRoot = path.dirname(
      createRequire(import.meta.url).resolve('wrangler/package.json')
    )
    // CI=1 makes Wrangler answer its "apply these migrations?" prompt instead of waiting.
    execFileSync(
      process.execPath,
      [
        path.join(wranglerRoot, 'bin', 'wrangler.js'),
        'd1',
        'migrations',
        'apply',
        'DB',
        '--local',
        '--persist-to',
        dir
      ],
      { cwd: ROOT, stdio: 'pipe', env: { ...process.env, CI: '1' } }
    )
    const proxy = await getPlatformProxy<{ DB: LocalD1 }>({
      configPath: path.join(ROOT, 'wrangler.jsonc'),
      // Wrangler's --persist-to keeps its state under v3/, which is the path the proxy takes.
      persist: { path: path.join(dir, 'v3') }
    })
    return {
      d1: proxy.env.DB,
      async dispose() {
        await proxy.dispose()
        rmSync(dir, { recursive: true, force: true })
      }
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}
