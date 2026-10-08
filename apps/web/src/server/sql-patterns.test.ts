// D1 refuses a LIKE or GLOB pattern over 50 bytes, and only once a row is evaluated, so a bound
// pattern passes tests on an empty table and fails in production. Match with instr() instead.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOTS = ['src', 'scripts', 'migrations']
const SOURCE = /\.(?:[cm]?js|tsx?|sql)$/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return sourceFiles(file)
    return SOURCE.test(name) && !/\.test\.[cm]?[jt]sx?$/.test(name) ? [file] : []
  })
}

// Whole-line comments are dropped (and SQL comments in .sql files), then each whole file is
// searched, so a pattern split across lines counts. Comments after code stay, so they can't hide
// a real LIKE. SQL in this repo is uppercase, so the operator form is matched in uppercase (prose
// says "like"); the function form like(…) or glob(…) is matched in any case.
function stripComments(source: string, file: string) {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ')
  const code = source.replace(/^\s*\/\*[\s\S]*?\*\//gm, blank).replace(/^\s*\/\/[^\n]*/gm, blank)
  return file.endsWith('.sql') ? code.replace(/--[^\n]*/g, blank) : code
}

// Every LIKE or GLOB operator must take one whole string literal as its pattern; anything else (a
// bound parameter, lower(?), a concatenation, a template) can carry user input past D1's limit.
const UNSAFE = [
  /\b(?:LIKE|GLOB)\b(?!\s*'[^'$"`]*'(?!\s*\|\|))/g,
  /\b(?:like|glob)\s*\(/gi,
  /`%\$\{/g
]

function findBoundPatterns(source: string, file = 'source.ts') {
  const code = stripComments(source, file)
  const lines = new Set<number>()
  for (const pattern of UNSAFE) {
    for (const match of code.matchAll(pattern)) {
      lines.add(code.slice(0, match.index).split('\n').length)
    }
  }
  return [...lines].sort((a, b) => a - b)
}

describe('SQL patterns', () => {
  it('never binds a value into a LIKE or GLOB pattern', () => {
    const offenders = ROOTS.flatMap(root => sourceFiles(path.join(process.cwd(), root))).flatMap(
      file =>
        findBoundPatterns(readFileSync(file, 'utf8'), file).map(
          line => `${path.relative(process.cwd(), file)}:${line}`
        )
    )
    expect(offenders).toEqual([])
  })

  it('catches the shapes it guards against', () => {
    expect(findBoundPatterns('WHERE lower(domain) LIKE lower(?)')).toEqual([1])
    expect(findBoundPatterns('WHERE domain LIKE ?')).toEqual([1])
    expect(findBoundPatterns("WHERE domain GLOB '*' || ? || '*'")).toEqual([1])
    expect(findBoundPatterns('const pattern = `%${q}%`')).toEqual([1])
    expect(findBoundPatterns('WHERE domain LIKE (?)')).toEqual([1])
    expect(findBoundPatterns("WHERE domain LIKE '%' || lower(?) || '%'")).toEqual([1])
    expect(findBoundPatterns('WHERE like(?, domain)')).toEqual([1])
    expect(findBoundPatterns('WHERE domain LIKE\n  ?')).toEqual([1])
    expect(findBoundPatterns('WHERE instr(lower(domain), ?) > 0')).toEqual([])
    expect(findBoundPatterns("WHERE status LIKE 'active%'")).toEqual([])
    expect(findBoundPatterns("const sql = `WHERE domain LIKE '%${q}%'`")).toEqual([1])
    expect(findBoundPatterns(`const sql = "WHERE domain LIKE '" + q + "'"`)).toEqual([1])
    expect(findBoundPatterns("run('--flag', `WHERE domain LIKE ?`)")).toEqual([1])
    expect(findBoundPatterns("const glob = 'image/*'\nconst sql = `WHERE domain LIKE ?`")).toEqual([
      2
    ])
    expect(findBoundPatterns('// never LIKE: D1 refuses long patterns')).toEqual([])
    expect(findBoundPatterns(' * Queries match with instr(), never LIKE.')).toEqual([1])
    expect(findBoundPatterns('/**\n * Queries match with instr(), never LIKE.\n */')).toEqual([])
    expect(findBoundPatterns('-- never LIKE ?', '0002.sql')).toEqual([])
  })
})
