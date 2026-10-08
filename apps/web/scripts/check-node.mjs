// Warns before `pnpm dev` when Node isn't the version package.json's engines field names.
// It no longer clears .next: Next 16 keeps dev output in .next/dev, apart from builds.
const major = Number(String(process.versions?.node || '').split('.')[0])
if (Number.isFinite(major) && major !== 22) {
  console.warn(
    `[dr.serp.co] Warning: Node ${process.version} detected; package.json expects ^22.12. Use Node 22.`
  )
}
