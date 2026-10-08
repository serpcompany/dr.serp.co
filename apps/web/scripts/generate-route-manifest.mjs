import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const appDir = path.resolve(process.cwd(), 'src/app')
const routeFilePattern = /^(page|route)\.(js|jsx|mjs|ts|tsx)$/
const sampleValues = {
  domain: 'example.com',
  id: 'sample-id',
  slug: 'sample-slug',
  target: 'example.com'
}

function printHelp() {
  console.log(`Usage: node scripts/generate-route-manifest.mjs [options]

Scans src/app and prints a deterministic JSON route manifest for Next.js app routes.

Options:
  --app-dir <path>        App directory to scan. Default: src/app
  --pretty               Pretty-print JSON with two-space indentation
  -h, --help             Show this help
`)
}

function parseArgs(argv) {
  const options = { appDir, pretty: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '-h' || arg === '--help') {
      return { ...options, help: true }
    }
    if (arg === '--pretty') {
      options.pretty = true
      continue
    }
    if (arg === '--app-dir') {
      const value = argv[index + 1]
      if (!value) throw new Error('--app-dir requires a path')
      options.appDir = path.resolve(process.cwd(), value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function segmentToPathPart(segment) {
  if (/^\(.+\)$/.test(segment)) return null
  if (/^@/.test(segment)) return null

  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/)
  if (optionalCatchAll) return sampleValues[optionalCatchAll[1]] ?? 'sample/path'

  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/)
  if (catchAll) return sampleValues[catchAll[1]] ?? 'sample/path'

  const dynamic = segment.match(/^\[(.+)\]$/)
  if (dynamic) return sampleValues[dynamic[1]] ?? `sample-${dynamic[1]}`

  return segment
}

function routePathFor(relativeDir) {
  if (!relativeDir || relativeDir === '.') return '/'

  const parts = relativeDir
    .split(path.sep)
    .map(segmentToPathPart)
    .filter(part => part !== null && part !== '')

  return `/${parts.join('/')}`.replace(/\/+/g, '/')
}

function routePatternFor(relativeDir) {
  if (!relativeDir || relativeDir === '.') return '/'

  const parts = relativeDir
    .split(path.sep)
    .filter(segment => !/^\(.+\)$/.test(segment) && !/^@/.test(segment))

  return `/${parts.join('/')}`.replace(/\/+/g, '/')
}

function hasDynamicSegment(relativeDir) {
  return relativeDir.split(path.sep).some(segment => segment.includes('['))
}

function pathVariants(routePath) {
  const variants = new Set([routePath])
  if (routePath !== '/' && !path.extname(routePath.split('/').at(-1) ?? '')) {
    variants.add(`${routePath}/`)
  }
  return [...variants].sort()
}

function exportedMethods(source) {
  const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  return methods.filter(method => {
    const patterns = [
      new RegExp(`export\\s+async\\s+function\\s+${method}\\b`),
      new RegExp(`export\\s+function\\s+${method}\\b`),
      new RegExp(`export\\s+const\\s+${method}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`)
    ]
    return patterns.some(pattern => pattern.test(source))
  })
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === '.devin' || entry.name === 'node_modules') continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }

    if (entry.isFile() && routeFilePattern.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files
}

async function generateManifest({ appDir: selectedAppDir }) {
  const appStats = await stat(selectedAppDir).catch(() => null)
  if (!appStats?.isDirectory()) {
    throw new Error(`App directory not found: ${selectedAppDir}`)
  }

  const files = await walk(selectedAppDir)
  const entries = []

  for (const file of files) {
    const filename = path.basename(file)
    const kind = filename.startsWith('page.') ? 'page' : 'route'
    const relativeDir = path.relative(selectedAppDir, path.dirname(file))
    const source = kind === 'route' ? await readFile(file, 'utf8') : ''
    const routePath = routePathFor(relativeDir)

    entries.push({
      kind,
      route: routePatternFor(relativeDir),
      path: routePath,
      variants: pathVariants(routePath),
      dynamic: hasDynamicSegment(relativeDir),
      methods: kind === 'page' ? ['GET', 'HEAD'] : exportedMethods(source),
      file: path.relative(process.cwd(), file).split(path.sep).join('/')
    })
  }

  entries.sort((a, b) => {
    const routeCompare = a.route.localeCompare(b.route)
    if (routeCompare !== 0) return routeCompare
    const kindCompare = a.kind.localeCompare(b.kind)
    if (kindCompare !== 0) return kindCompare
    return a.file.localeCompare(b.file)
  })

  return entries
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    process.exit(0)
  }

  const manifest = await generateManifest(options)
  console.log(JSON.stringify(manifest, null, options.pretty ? 2 : 0))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
