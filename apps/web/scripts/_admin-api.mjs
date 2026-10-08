import { loadProjectEnv } from "./_load-env.mjs"

export function parseFlagArgs(argv = process.argv.slice(2)) {
  const flags = new Set()
  const values = new Map()
  const positionals = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith("--")) {
      positionals.push(arg)
      continue
    }

    const [rawName, rawValue] = arg.slice(2).split("=", 2)
    const name = rawName.trim()
    if (!name) continue

    if (rawValue !== undefined) {
      values.set(name, rawValue)
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith("--")) {
      values.set(name, next)
      index += 1
      continue
    }

    flags.add(name)
  }

  return { flags, values, positionals }
}

export function parseIntOption(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

export function loadAdminEnv() {
  loadProjectEnv()
  const baseUrl =
    process.env.DR_ADMIN_BASE_URL ||
    process.env.DR_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    ""
  const token = process.env.DR_ADMIN_TOKEN || ""
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
  }
}

export function hasAdminApi(env = loadAdminEnv()) {
  return Boolean(env.baseUrl && env.token)
}

export async function callAdminApi(pathname, { body = {}, method = "POST", env = loadAdminEnv() } = {}) {
  if (!hasAdminApi(env)) {
    throw new Error("Set DR_ADMIN_BASE_URL or DR_PUBLIC_BASE_URL plus DR_ADMIN_TOKEN to use the Worker admin API.")
  }

  const response = await fetch(`${env.baseUrl}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": env.token,
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`Admin API ${pathname} failed with ${response.status}: ${JSON.stringify(payload)}`)
  }
  return payload
}
