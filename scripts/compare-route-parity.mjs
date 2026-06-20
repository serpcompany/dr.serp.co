import { readFile } from "node:fs/promises"
import { spawn } from "node:child_process"

const defaultTimeoutMs = 15_000

function printHelp() {
  console.log(`Usage: node scripts/compare-route-parity.mjs [options]

Compares generated route-manifest paths between two deployments and prints a JSON summary.
Base URLs may be provided with --base-a/--base-b or BASE_A_URL/BASE_B_URL.

Options:
  --base-a <url>          Baseline/origin base URL
  --base-b <url>          Candidate/Cloudflare base URL
  --manifest <path>       Manifest JSON file. Defaults to stdin; if stdin is a TTY, generates one locally
  --method <method>       HTTP method for checks. Default: GET
  --timeout-ms <ms>       Per-request timeout. Default: 15000
  --pretty               Pretty-print JSON summary
  -h, --help             Show this help

Environment:
  BASE_A_URL, BASE_B_URL  Base URLs when CLI args are omitted
  ORIGIN_URL, TARGET_URL  Accepted aliases
`)
}

function parseArgs(argv) {
  const options = {
    baseA: process.env.BASE_A_URL || process.env.ORIGIN_URL || "",
    baseB: process.env.BASE_B_URL || process.env.TARGET_URL || "",
    manifestPath: "",
    method: "GET",
    pretty: false,
    timeoutMs: defaultTimeoutMs,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "-h" || arg === "--help") return { ...options, help: true }
    if (arg === "--pretty") {
      options.pretty = true
      continue
    }
    if (arg === "--base-a" || arg === "--origin") {
      options.baseA = requiredValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === "--base-b" || arg === "--target") {
      options.baseB = requiredValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === "--manifest") {
      options.manifestPath = requiredValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === "--method") {
      options.method = requiredValue(argv, index, arg).toUpperCase()
      index += 1
      continue
    }
    if (arg === "--timeout-ms") {
      options.timeoutMs = Number(requiredValue(argv, index, arg))
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function requiredValue(argv, index, arg) {
  const value = argv[index + 1]
  if (!value) throw new Error(`${arg} requires a value`)
  return value
}

function normalizeBaseUrl(value, name) {
  try {
    const url = new URL(value)
    url.pathname = url.pathname.replace(/\/+$/, "")
    url.search = ""
    url.hash = ""
    return url
  } catch {
    throw new Error(`${name} must be an absolute URL`)
  }
}

function urlFor(baseUrl, routePath) {
  const url = new URL(baseUrl.href)
  const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")
  url.pathname = `${basePath}${routePath.startsWith("/") ? routePath : `/${routePath}`}`
  return url
}

async function readStdin() {
  if (process.stdin.isTTY) return ""

  let input = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) input += chunk
  return input
}

async function generatedManifestJson() {
  const child = spawn(process.execPath, ["scripts/generate-route-manifest.mjs"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  })

  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })

  const exitCode = await new Promise((resolve) => {
    child.on("close", resolve)
  })

  if (exitCode !== 0) {
    throw new Error(`Manifest generation failed: ${stderr.trim()}`)
  }

  return stdout
}

async function loadManifest(manifestPath) {
  const source = manifestPath ? await readFile(manifestPath, "utf8") : (await readStdin()) || (await generatedManifestJson())
  const parsed = JSON.parse(source)
  if (!Array.isArray(parsed)) throw new Error("Manifest must be a JSON array")
  return parsed
}

function comparableHeaders(headers) {
  return {
    "cache-control": headers.get("cache-control") || "",
    "content-type": headers.get("content-type") || "",
    location: headers.get("location") || "",
  }
}

async function fetchSnapshot(baseUrl, routePath, { method, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const targetUrl = urlFor(baseUrl, routePath)

  try {
    const response = await fetch(targetUrl, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "*/*",
        "user-agent": "dr-route-parity-check/1.0",
      },
    })
    const body = await response.text().catch(() => "")
    return {
      ok: true,
      url: targetUrl.href,
      status: response.status,
      redirected: response.status >= 300 && response.status < 400,
      headers: comparableHeaders(response.headers),
      body: {
        empty: body.length === 0,
        length: body.length,
        startsWithHtml: /^\s*<!doctype html|^\s*<html[\s>]/i.test(body),
        startsWithJson: /^\s*[\[{]/.test(body),
        startsWithSvg: /^\s*<svg[\s>]/i.test(body),
      },
    }
  } catch (error) {
    return {
      ok: false,
      url: targetUrl.href,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function compareSnapshots(a, b) {
  const mismatches = []
  if (a.ok !== b.ok) mismatches.push("ok")
  if (!a.ok || !b.ok) {
    if (a.error !== b.error) mismatches.push("error")
    return mismatches
  }

  if (a.status !== b.status) mismatches.push("status")
  if (a.redirected !== b.redirected) mismatches.push("redirected")
  for (const header of ["location", "content-type", "cache-control"]) {
    if (a.headers[header] !== b.headers[header]) mismatches.push(header)
  }
  for (const key of ["empty", "startsWithHtml", "startsWithJson", "startsWithSvg"]) {
    if (a.body[key] !== b.body[key]) mismatches.push(`body.${key}`)
  }
  if (!a.body.empty && !b.body.empty) {
    const larger = Math.max(a.body.length, b.body.length)
    const smaller = Math.min(a.body.length, b.body.length)
    if (larger > 0 && smaller / larger < 0.25) mismatches.push("body.length")
  }

  return mismatches
}

function pathsFromManifest(manifest) {
  const paths = new Map()
  for (const entry of manifest) {
    const variants = Array.isArray(entry.variants) && entry.variants.length > 0 ? entry.variants : [entry.path]
    for (const routePath of variants) {
      if (typeof routePath !== "string" || !routePath.startsWith("/")) continue
      paths.set(routePath, {
        path: routePath,
        route: entry.route,
        kind: entry.kind,
        dynamic: Boolean(entry.dynamic),
      })
    }
  }
  return [...paths.values()].sort((a, b) => a.path.localeCompare(b.path))
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    process.exit(0)
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive number")
  }
  if (!options.baseA || !options.baseB) {
    throw new Error("Two base URLs are required via --base-a/--base-b or BASE_A_URL/BASE_B_URL")
  }

  const baseA = normalizeBaseUrl(options.baseA, "base A")
  const baseB = normalizeBaseUrl(options.baseB, "base B")
  const manifest = await loadManifest(options.manifestPath)
  const paths = pathsFromManifest(manifest)
  const checks = []

  for (const entry of paths) {
    const [a, b] = await Promise.all([
      fetchSnapshot(baseA, entry.path, options),
      fetchSnapshot(baseB, entry.path, options),
    ])
    const mismatches = compareSnapshots(a, b)
    checks.push({ ...entry, mismatches, a, b })
  }

  const failures = checks.filter((check) => check.mismatches.length > 0)
  const summary = {
    ok: failures.length === 0,
    comparedAt: new Date().toISOString(),
    method: options.method,
    baseA: baseA.href,
    baseB: baseB.href,
    total: checks.length,
    failures: failures.length,
    checks,
  }

  console.log(JSON.stringify(summary, null, options.pretty ? 2 : 0))
  process.exit(failures.length > 0 ? 1 : 0)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(2)
}
