import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// buttonVariants() is a raw cva string: base-nova's base classes and the variant's classes both
// land on the element, so `border-transparent` beats the outline variant's `border-border`. Button
// itself merges them with cn(), and a link styled as a button must too.
const SRC = join(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

describe('link buttons', () => {
  it('pass buttonVariants() through cn()', () => {
    const unmerged = sourceFiles(SRC).flatMap(path =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /className=\{buttonVariants\(/.test(line) ? [`${relative(SRC, path)}:${index + 1}`] : []
        )
    )
    expect(unmerged).toEqual([])
  })
})
