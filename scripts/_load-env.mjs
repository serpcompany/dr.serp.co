import fs from "node:fs"
import path from "node:path"

export function loadProjectEnv(cwd = process.cwd()) {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(cwd, name)
    if (!fs.existsSync(filePath)) continue

    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue

      const separator = trimmed.indexOf("=")
      if (separator === -1) continue

      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  }
}

export function getDatabaseConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_URL_NON_POOLING ||
    null
  )
}
