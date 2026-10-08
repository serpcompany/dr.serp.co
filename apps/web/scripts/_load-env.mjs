import fs from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

// Local values live in .dev.vars, never in .env* files, which the OpenNext build copies into the
// Worker bundle. Variables already set in the shell win.
export function loadProjectEnv(cwd = process.cwd()) {
  const filePath = path.join(cwd, ".dev.vars")
  if (!fs.existsSync(filePath)) return

  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(filePath, "utf8")))) {
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}
