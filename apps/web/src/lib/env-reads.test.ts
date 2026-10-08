// No module reads process.env at load time: OpenNext fills it per request, and a value read into a
// module-scope constant stays whatever the isolate loaded with (#71). Reads belong inside functions.
// This checks where a read is written, not when it runs: a module-scope call to a function that reads
// process.env (`const X = readX()`) gets past it, so don't write one.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')
const SOURCE = /\.(ts|tsx|mjs|js)$/
const TEST = /\.test\.(ts|tsx|mjs|js)$/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return SOURCE.test(name) && !TEST.test(name) ? [full] : []
  })
}

function isProcessEnv(node: ts.Node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'env'
  )
}

// Each `process.env` with no enclosing function, as "file:line".
function loadTimeEnvReads(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const found: string[] = []
  const visit = (node: ts.Node, inFunction: boolean) => {
    if (!inFunction && isProcessEnv(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart())
      found.push(`${path.relative(ROOT, file)}:${line + 1}`)
    }
    const nested = inFunction || ts.isFunctionLike(node)
    ts.forEachChild(node, child => visit(child, nested))
  }
  visit(source, false)
  return found
}

describe('configuration reads', () => {
  it('finds a load-time read and ignores one inside a function', () => {
    const text = [
      'const POINTS = Number(process.env.POINTS ?? 10)',
      'export function points() { return Number(process.env.POINTS ?? 10) }',
      'export const limit = () => process.env.LIMIT'
    ].join('\n')

    expect(loadTimeEnvReads(path.join(ROOT, 'src/example.ts'), text)).toEqual(['src/example.ts:1'])
  })

  it('no module reads process.env outside a function', () => {
    const files = [...sourceFiles(path.join(ROOT, 'src')), path.join(ROOT, 'cloudflare-worker.js')]
    const reads = files.flatMap(file => loadTimeEnvReads(file, readFileSync(file, 'utf8')))

    expect(reads).toEqual([])
  })
})
