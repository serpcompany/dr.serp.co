import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// SERP UI rule (shadcn first): colors come only from the theme tokens in globals.css. Stock shadcn
// files stay as the registry writes them, and the badge templates are SVG images drawn for other
// sites, not themed UI, so both are skipped.
const SRC = join(process.cwd(), 'src')
const SKIPPED_FILES = new Set(['app/globals.css'])
const SKIPPED_DIRECTORIES = ['components/ui/', 'app/badge/']

const NAMED =
  'white|black|red|orange|yellow|green|blue|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia'
const PALETTE =
  'white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITY =
  'bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|from|via|to|shadow|divide|placeholder|accent|caret|decoration'

// A hex color, except a same-page link such as href="#add".
const HEX = /(?<!href=["'`])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i
const NAMED_COLOR = new RegExp(
  `(?:\\b(?:fill|stroke|color)=|\\b(?:color|background(?:Color)?|borderColor|fill|stroke)\\s*:\\s*)["'\`](?:${NAMED})["'\`]`,
  'i'
)
const PALETTE_CLASS = new RegExp(`\\b(?:${UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?\\b`)
const ARBITRARY_COLOR = new RegExp(`\\b(?:${UTILITY})-\\[(?:${NAMED}|#[0-9a-f]{3,8})\\]`, 'i')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:css|[mc]?[jt]sx?)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)
      ? [path]
      : []
  })
}

// Comments cite issues as #123, which reads like a hex color, so they are dropped first: line
// comments, one-line block comments, and the lines of a block comment that start with * or /*.
function withoutComments(line: string) {
  if (/^\s*(?:\/?\*)/.test(line)) return ''
  return line.replace(/\{?\/\*.*?\*\/\}?/g, '').replace(/(^|\s)\/\/.*$/, '')
}

function violations(patterns: RegExp[], files = sourceFiles(SRC)) {
  return files.flatMap(path => {
    const file = relative(SRC, path)
    if (SKIPPED_FILES.has(file) || SKIPPED_DIRECTORIES.some(prefix => file.startsWith(prefix))) {
      return []
    }
    return readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        const code = withoutComments(line)
        return patterns.some(pattern => pattern.test(code))
          ? [`${file}:${index + 1}: ${line.trim()}`]
          : []
      })
  })
}

describe('design tokens', () => {
  it('uses no literal colors outside globals.css', () => {
    expect(violations([HEX, COLOR_FUNCTION, NAMED_COLOR])).toEqual([])
  })

  it('uses no Tailwind palette colors or arbitrary color values', () => {
    expect(violations([PALETTE_CLASS, ARBITRARY_COLOR])).toEqual([])
  })

  it('catches what it should and nothing else', () => {
    const caught = [
      [PALETTE_CLASS, 'className="bg-white text-gray-500"'],
      [PALETTE_CLASS, 'className="border-s-red-500"'],
      [ARBITRARY_COLOR, 'className="bg-[white]"'],
      [ARBITRARY_COLOR, 'className="text-[#36d984]"'],
      [HEX, "style={{ color: '#36d984' }}"],
      [COLOR_FUNCTION, 'fill="rgb(0 0 0)"'],
      [NAMED_COLOR, 'fill="white"'],
      [NAMED_COLOR, "style={{ color: 'red' }}"]
    ] as const
    for (const [pattern, line] of caught) expect(pattern.test(line), line).toBe(true)

    const allowed = [
      'className="bg-primary text-muted-foreground border-border"',
      '<a href="#add">Add</a>',
      'fill="currentColor"',
      'const red = 1'
    ]
    for (const line of allowed) {
      for (const pattern of [HEX, COLOR_FUNCTION, NAMED_COLOR, PALETTE_CLASS, ARBITRARY_COLOR]) {
        expect(pattern.test(line), line).toBe(false)
      }
    }
    for (const comment of ['// Removed in #108, see #110', ' * Removed in #108', '/* #fff */']) {
      expect(withoutComments(comment).trim(), comment).toBe('')
    }
  })
})

// PR #144 review: with --muted equal to --card, slider tracks, the DR gauge's empty arc and
// skeletons vanished inside cards in dark mode.
describe('theme tokens', () => {
  const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`)
    return css.slice(start, css.indexOf('}', start))
  }
  const token = (body: string, name: string) =>
    new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim()

  // Lightness of an oklch() token; a token that isn't a literal oklch() colour fails the test.
  const lightness = (value: string | undefined) => {
    const match = /^oklch\(\s*([\d.]+)/.exec(value ?? '')
    return match ? Number(match[1]) : Number.NaN
  }

  it('keeps muted surfaces visibly distinct from cards in both themes', () => {
    for (const selector of [':root', '.dark']) {
      const body = block(selector)
      const gap = Math.abs(lightness(token(body, 'muted')) - lightness(token(body, 'card')))
      // 0.04 in oklch lightness is about stock shadcn's dark step between card and muted.
      expect(gap, selector).toBeGreaterThanOrEqual(0.02)
      if (selector === '.dark') expect(gap, selector).toBeGreaterThanOrEqual(0.04)
    }
  })
})
