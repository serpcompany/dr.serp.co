import fs from "node:fs"

const major = Number(String(process.versions?.node || "").split(".")[0])
if (Number.isFinite(major) && major >= 23) {
  // eslint-disable-next-line no-console
  console.warn(
    `[dr.serp.co] Warning: Node ${process.version} detected; package.json expects ^20.12 || ^22. Consider using Node 22 to avoid Next.js/webpack chunk issues.`
  )
}

const nextDir = new URL("../.next/", import.meta.url)

try {
  fs.rmSync(nextDir, { recursive: true, force: true })
} catch {
  // ignore
}
