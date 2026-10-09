import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// SERP UI rule (shadcn first): colors come only from the theme tokens in globals.css. Stock shadcn
// files stay as the registry writes them, and the badge templates are SVG images drawn for other
// sites, not themed UI, so both are skipped.
const SRC = join(process.cwd(), 'src')
const SKIPPED_FILES = new Set(['app/globals.css'])
const SKIPPED_DIRECTORIES = ['components/ui/', 'app/badge/']

const LITERAL_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i
const PALETTE_CLASS =
  /\b(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|outline|fill|stroke|from|via|to|shadow|divide|placeholder|accent|caret|decoration)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:css|ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

// Comments cite issues as #123, which reads like a hex color, so they are dropped first.
function withoutComments(line: string) {
  return line.replace(/\{?\/\*.*?\*\/\}?/g, '').replace(/(^|\s)\/\/.*$/, '')
}

function violations(pattern: RegExp, files = sourceFiles(SRC)) {
  return files.flatMap(path => {
    const file = relative(SRC, path)
    if (SKIPPED_FILES.has(file) || SKIPPED_DIRECTORIES.some(prefix => file.startsWith(prefix))) {
      return []
    }
    return readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        pattern.test(withoutComments(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : []
      )
  })
}

describe('design tokens', () => {
  it('uses no literal colors outside globals.css', () => {
    expect(violations(LITERAL_COLOR)).toEqual([])
  })

  it('uses no Tailwind palette colors', () => {
    expect(violations(PALETTE_CLASS)).toEqual([])
  })

  it('catches a palette class, a hex value and an rgb() color', () => {
    expect(PALETTE_CLASS.test('className="bg-white text-gray-500"')).toBe(true)
    expect(LITERAL_COLOR.test("style={{ color: '#36d984' }}")).toBe(true)
    expect(LITERAL_COLOR.test('fill="rgb(0 0 0)"')).toBe(true)
    expect(PALETTE_CLASS.test('className="bg-primary text-muted-foreground"')).toBe(false)
    expect(LITERAL_COLOR.test(withoutComments('// Removed in #108, see #110'))).toBe(false)
  })
})
