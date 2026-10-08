// D1 refuses a LIKE or GLOB pattern over 50 bytes, and only once a row is evaluated, so a bound
// pattern passes tests on an empty table and fails in production. Match with instr() instead.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const ROOTS = ["src", "scripts", "migrations"]
const SOURCE = /\.(?:[cm]?js|tsx?|sql)$/

// A LIKE or GLOB whose pattern is a bound parameter, alone or inside lower(), concatenation or a
// template literal, or a JavaScript-built `%…%` pattern.
const BOUND_PATTERN = [
  /\b(?:LIKE|GLOB)\s+(?:lower\s*\(\s*|upper\s*\(\s*)?\?/i,
  /\b(?:LIKE|GLOB)\s+[^\n]*\|\|\s*\?/i,
  /\b(?:LIKE|GLOB)\s+[^\n]*\$\{/i,
  /`%\$\{/,
]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return SOURCE.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name) ? [file] : []
  })
}

function findBoundPatterns(source: string) {
  return source
    .split("\n")
    .flatMap((line, index) => (BOUND_PATTERN.some((pattern) => pattern.test(line)) ? [index + 1] : []))
}

describe("SQL patterns", () => {
  it("never binds a value into a LIKE or GLOB pattern", () => {
    const offenders = ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root))).flatMap((file) =>
      findBoundPatterns(readFileSync(file, "utf8")).map((line) => `${path.relative(process.cwd(), file)}:${line}`)
    )
    expect(offenders).toEqual([])
  })

  it("catches the shapes it guards against", () => {
    expect(findBoundPatterns("WHERE lower(domain) LIKE lower(?)")).toEqual([1])
    expect(findBoundPatterns("WHERE domain LIKE ?")).toEqual([1])
    expect(findBoundPatterns("WHERE domain GLOB '*' || ? || '*'")).toEqual([1])
    expect(findBoundPatterns("const pattern = `%${q}%`")).toEqual([1])
    expect(findBoundPatterns("WHERE instr(lower(domain), ?) > 0")).toEqual([])
    expect(findBoundPatterns("WHERE status LIKE 'active%'")).toEqual([])
  })
})
