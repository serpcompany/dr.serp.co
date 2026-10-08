// Starts `next dev` with the local values from .dev.vars in its environment. Local values never go
// in .env* files, because the OpenNext build copies those into the Worker bundle.
import { createRequire } from "node:module"
import { loadProjectEnv } from "./_load-env.mjs"
import { runForwardingSignals } from "./_spawn.mjs"

loadProjectEnv()

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next")
runForwardingSignals(process.execPath, [nextBin, "dev", ...process.argv.slice(2)])
