import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { loadProjectEnv } from "./_load-env.mjs"

const KEYS = ["LOAD_ENV_TEST_FROM_DEV_VARS", "LOAD_ENV_TEST_SHELL", "LOAD_ENV_TEST_FROM_ENV"]
let dir: string | undefined

afterEach(() => {
  for (const key of KEYS) delete process.env[key]
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

function projectWith(files: Record<string, string>) {
  dir = mkdtempSync(path.join(tmpdir(), "load-env-"))
  for (const [name, contents] of Object.entries(files)) writeFileSync(path.join(dir, name), contents)
  return dir
}

describe("loadProjectEnv", () => {
  it("loads .dev.vars, ignores .env files, and keeps values already in the shell", () => {
    const cwd = projectWith({
      ".dev.vars": 'LOAD_ENV_TEST_FROM_DEV_VARS="quoted value"\nLOAD_ENV_TEST_SHELL=from-file\n',
      ".env": "LOAD_ENV_TEST_FROM_ENV=from-env\n",
      ".env.local": "LOAD_ENV_TEST_FROM_ENV=from-env-local\n",
    })
    process.env.LOAD_ENV_TEST_SHELL = "from-shell"

    loadProjectEnv(cwd)

    expect(process.env.LOAD_ENV_TEST_FROM_DEV_VARS).toBe("quoted value")
    expect(process.env.LOAD_ENV_TEST_SHELL).toBe("from-shell")
    expect(process.env.LOAD_ENV_TEST_FROM_ENV).toBeUndefined()
  })

  it("does nothing without a .dev.vars file", () => {
    loadProjectEnv(projectWith({ ".env": "LOAD_ENV_TEST_FROM_ENV=from-env\n" }))
    expect(process.env.LOAD_ENV_TEST_FROM_ENV).toBeUndefined()
  })
})
