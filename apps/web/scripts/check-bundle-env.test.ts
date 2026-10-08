import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const script = fileURLToPath(new URL("./check-bundle-env.mjs", import.meta.url))
let dir: string | undefined

function runCheck(contents: string) {
  dir = mkdtempSync(path.join(tmpdir(), "check-bundle-env-"))
  const file = path.join(dir, "next-env.mjs")
  writeFileSync(file, contents)
  try {
    const stdout = execFileSync(process.execPath, [script, file], { encoding: "utf8", stdio: "pipe" })
    return { status: 0, output: stdout }
  } catch (error) {
    const failure = error as { status: number; stderr: string }
    return { status: failure.status, output: failure.stderr }
  }
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe("check-bundle-env", () => {
  it("passes when no .env* values were inlined", () => {
    const result = runCheck(
      ["production", "development", "test"].map((mode) => `export const ${mode} = {};`).join("\n"),
    )
    expect(result.status).toBe(0)
  })

  it("fails and names the keys, never the values", () => {
    const result = runCheck(
      'export const production = {"STRIPE_SECRET_KEY":"sk_live_secret"};\nexport const test = {};',
    )
    expect(result.status).toBe(1)
    expect(result.output).toContain("production: STRIPE_SECRET_KEY")
    expect(result.output).not.toContain("sk_live_secret")
  })
})
