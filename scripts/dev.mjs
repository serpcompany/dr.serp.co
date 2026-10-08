// Starts `next dev` with the local values from .dev.vars in its environment. Local values never go
// in .env* files, because the OpenNext build copies those into the Worker bundle.
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { loadProjectEnv } from "./_load-env.mjs"

loadProjectEnv()

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next")
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], { stdio: "inherit" })
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
