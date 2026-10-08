import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

function parseArgs(rawArgs) {
  const args = [...rawArgs]
  const options = {
    apply: false,
    remote: true,
    bucket: process.env.R2_BADGE_BUCKET || "",
    backupPrefix: "",
    mapPath: "scripts/r2-badge-replacements.json",
  }

  while (args.length > 0) {
    const token = args.shift()

    if (token === "--") {
      continue
    }

    if (token === "--apply") {
      options.apply = true
      continue
    }
    if (token === "--local") {
      options.remote = false
      continue
    }
    if (token === "--remote") {
      options.remote = true
      continue
    }
    if (token === "--bucket") {
      options.bucket = String(args.shift() || "").trim()
      continue
    }
    if (token === "--backup-prefix") {
      options.backupPrefix = String(args.shift() || "").trim()
      continue
    }
    if (token === "--map") {
      options.mapPath = String(args.shift() || "").trim()
      continue
    }
    if (token === "-h" || token === "--help") {
      printHelp()
      process.exit(0)
    }

    throw new Error(`Unknown argument: ${token}`)
  }

  return options
}

function printHelp() {
  console.log(`Usage:
  node scripts/replace-r2-badge-assets.mjs [options]

Options:
  --apply                  Execute changes. Default is dry-run.
  --bucket <name>          R2 bucket name. Can also use R2_BADGE_BUCKET.
  --remote                 Use remote R2 via Cloudflare API (default).
  --local                  Use local R2 storage instead of remote.
  --backup-prefix <path>   Backup key prefix in bucket.
  --map <path>             JSON file with replacements (default: scripts/r2-badge-replacements.json)
  -h, --help               Show this help.

Map JSON format:
[
  { "key": "serp-dr-small.svg", "source": "svgs/badges/verified-dr.svg" }
]`)
}

function loadReplacementMap(mapPath) {
  const resolved = path.resolve(process.cwd(), mapPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Replacement map not found: ${resolved}`)
  }

  const raw = fs.readFileSync(resolved, "utf8")
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Replacement map must be a non-empty array: ${resolved}`)
  }

  return parsed.map((entry, index) => {
    const key = String(entry?.key || "").trim()
    const source = String(entry?.source || "").trim()
    if (!key || !source) {
      throw new Error(`Invalid replacement at index ${index}: ${JSON.stringify(entry)}`)
    }
    return {
      key,
      sourcePath: path.resolve(process.cwd(), source),
      sourceRaw: source,
    }
  })
}

function runWrangler(args, { apply }) {
  const cmd = ["exec", "wrangler", "r2", "object", ...args]
  const printable = `pnpm ${cmd.join(" ")}`

  if (!apply) {
    console.log(`[dry-run] ${printable}`)
    return
  }

  const result = spawnSync("pnpm", cmd, {
    cwd: process.cwd(),
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${printable}`)
  }
}

function ensureDirForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function nowStamp() {
  const iso = new Date().toISOString()
  return iso.replace(/[:.]/g, "-")
}

function keyToLocalPath(rootDir, key) {
  const safe = key.split("/").filter(Boolean)
  return path.join(rootDir, ...safe)
}

const options = parseArgs(process.argv.slice(2))

if (!options.bucket) {
  throw new Error("Missing bucket. Use --bucket <name> or set R2_BADGE_BUCKET.")
}

const replacements = loadReplacementMap(options.mapPath)
const stamp = nowStamp()
const backupPrefix = options.backupPrefix || `_backup/badges/${stamp}`
const localBackupRoot = path.resolve(process.cwd(), "tmp", "r2-badge-backups", stamp)

const storageModeFlag = options.remote ? "--remote" : "--local"
const rollbackNotes = []

console.log("R2 badge replacement plan:")
console.log(`- mode: ${options.remote ? "remote" : "local"}`)
console.log(`- apply: ${options.apply}`)
console.log(`- bucket: ${options.bucket}`)
console.log(`- backup prefix: ${backupPrefix}`)
console.log(`- local backup dir: ${localBackupRoot}`)
console.log("")

for (const item of replacements) {
  if (!fs.existsSync(item.sourcePath)) {
    throw new Error(`Source file not found for key "${item.key}": ${item.sourcePath}`)
  }
}

for (const item of replacements) {
  const objectPath = `${options.bucket}/${item.key}`
  const backupObjectPath = `${options.bucket}/${backupPrefix}/${item.key}`
  const localBackupFile = keyToLocalPath(localBackupRoot, item.key)

  ensureDirForFile(localBackupFile)

  console.log(`Processing key: ${item.key}`)
  console.log(`- source: ${item.sourceRaw}`)

  runWrangler(["get", objectPath, storageModeFlag, "--file", localBackupFile], {
    apply: options.apply,
  })

  runWrangler(
    [
      "put",
      backupObjectPath,
      storageModeFlag,
      "--file",
      localBackupFile,
      "--content-type",
      "image/svg+xml",
    ],
    { apply: options.apply }
  )

  runWrangler(
    [
      "put",
      objectPath,
      storageModeFlag,
      "--file",
      item.sourcePath,
      "--content-type",
      "image/svg+xml",
    ],
    { apply: options.apply }
  )

  rollbackNotes.push(
    `pnpm exec wrangler r2 object put ${objectPath} ${storageModeFlag} --file ${localBackupFile} --content-type image/svg+xml`
  )

  console.log("")
}

console.log("Complete.")
console.log(options.apply ? "Changes were applied." : "Dry-run only, no changes applied.")
console.log("")
console.log("Rollback commands:")
for (const command of rollbackNotes) {
  console.log(`- ${command}`)
}
