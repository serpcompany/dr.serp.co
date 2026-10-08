import fs from 'node:fs'

const major = Number(String(process.versions?.node || '').split('.')[0])
if (Number.isFinite(major) && major !== 22) {
  console.warn(
    `[dr.serp.co] Warning: Node ${process.version} detected; package.json expects ^22.12. Consider using Node 22 to avoid Next.js/webpack chunk issues.`
  )
}

const nextDir = new URL('../.next/', import.meta.url)

try {
  fs.rmSync(nextDir, { recursive: true, force: true })
} catch {
  // ignore
}
