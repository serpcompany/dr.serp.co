// cloudflare-worker.d.ts declares cloudflare-worker.js's exports by hand, and skipLibCheck means the
// type checker never compares the two. This keeps their export names in step.
import { readFileSync } from 'node:fs'
import path from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')

function exportNames(file: string): string[] {
  const text = readFileSync(path.join(ROOT, file), 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const names: string[] = []
  for (const node of source.statements) {
    if (ts.isExportAssignment(node)) names.push('default')
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) names.push(element.name.text)
    }
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined
    if (modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const isDefault = modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
      if (isDefault) names.push('default')
      else if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text)
        }
      } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
        names.push(node.name.text)
      }
    }
  }
  return names.sort()
}

describe('Worker entry types', () => {
  it('declare the same exports as cloudflare-worker.js', () => {
    expect(exportNames('cloudflare-worker.js')).toEqual(['RateLimitDurableObject', 'default'])
    expect(exportNames('cloudflare-worker.d.ts')).toEqual(exportNames('cloudflare-worker.js'))
  })
})
