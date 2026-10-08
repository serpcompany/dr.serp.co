// Fails when the OpenNext build copied values from .env* files into the Worker bundle.
// OpenNext writes every .env* file Next.js loads into next-env.mjs, which ships with the Worker,
// so a credential in .env or .env.local reaches every deploy. Local values belong in .dev.vars.
// Prints key names only, never values.
import { existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const file = path.resolve(process.argv[2] ?? ".open-next/cloudflare/next-env.mjs")

if (!existsSync(file)) {
  console.error(`check-bundle-env: ${file} not found. Run the OpenNext build first.`)
  process.exit(1)
}

const modes = await import(pathToFileURL(file).href)
const leaks = Object.entries(modes).flatMap(([mode, vars]) =>
  Object.keys(vars ?? {}).map((key) => `${mode}: ${key}`),
)

if (leaks.length > 0) {
  console.error(
    [
      "check-bundle-env: the Worker bundle contains values from .env* files:",
      ...leaks.map((leak) => `  ${leak}`),
      "Move local values to .dev.vars and deployed ones to Worker vars or secrets, then rebuild.",
    ].join("\n"),
  )
  process.exit(1)
}

console.log("check-bundle-env: the Worker bundle carries no .env* values.")
