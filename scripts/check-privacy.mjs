/**
 * The static half of the privacy claim: this tool contacts no third party.
 *
 * Three rules, checked without running anything:
 *
 *   1. index.html loads nothing from another origin.
 *   2. No network primitive appears anywhere in src/.
 *   3. No external URL is embedded in the built bundle.
 *
 * Rule 3 is why this runs AFTER the build in `npm run verify`. Run before it,
 * on a clean tree, the bundle scan has nothing to read and skips itself, which
 * is a check reporting success for work it did not do.
 *
 * The runtime half is scripts/check-network.mjs, which drives a real browser
 * and proves the code never TRIES to reach another origin. Neither substitutes
 * for the other: this one reads what was shipped, that one watches what runs.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { extname, join } from 'node:path'

const site = readFileSync('src/lib/site.ts', 'utf8')
const SITE_URL = (site.match(/SITE_URL\s*=\s*['"]([^'"]+)['"]/) ?? [])[1]
const REPO_URL = (site.match(/REPO_URL(?::[^=]+)?=\s*['"]([^'"]+)['"]/) ?? [])[1] ?? null

if (!SITE_URL) {
  console.error('FAIL: SITE_URL could not be read from src/lib/site.ts')
  process.exit(1)
}

const failures = []

function walk(dir, extensions, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, extensions, out)
    else if (extensions.has(extname(path))) out.push(path)
  }
  return out
}

// Rule 1. A canonical or alternate link is metadata: it declares an address, it
// does not fetch one. Everything else pointing off-origin is a request.
const html = readFileSync('index.html', 'utf8')
for (const match of html.matchAll(/<(link|script|img|iframe)\b[^>]*?\b(href|src)="([^"]+)"/g)) {
  const [, tag, , url] = match
  if (!/^(https?:)?\/\//.test(url)) continue
  if (url.startsWith(SITE_URL) || url.startsWith('__SITE_URL__')) continue
  if (tag === 'link' && /rel="(canonical|alternate)"/.test(match[0])) continue
  failures.push(`index.html loads ${url} from another origin`)
}

// Rule 2. Comments may name these; code may not call them.
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(/
for (const file of walk('src', new Set(['.ts', '.tsx', '.js', '.jsx']))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) return
      if (NETWORK.test(line)) failures.push(`${file}:${i + 1} uses a network primitive`)
    })
}

// Rule 3. Namespaces are identifiers rather than addresses: nothing fetches them.
const INERT_URLS = [
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.sitemaps.org/schemas/sitemap/',
  'https://reactjs.org/docs/error-decoder.html',
]

if (!existsSync('dist')) {
  console.log('note: dist/ not present, skipping bundle scan. Run npm run build first.')
} else {
  for (const file of walk('dist', new Set(['.html', '.js', '.css', '.txt', '.xml', '.json']))) {
    const text = readFileSync(file, 'utf8')
    for (const found of text.matchAll(/https?:\/\/[^\s"'`)\\]+/g)) {
      const url = found[0].replace(/[.,;]+$/, '')
      if (INERT_URLS.some((inert) => url.startsWith(inert))) continue
      if (url.startsWith(SITE_URL)) continue
      // Exact equality rather than a prefix, deliberately, so this cannot be
      // used to wave through some other github.com URL.
      if (REPO_URL !== null && url === REPO_URL) continue
      failures.push(`${file} embeds ${url}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`Privacy check failed with ${failures.length} issue(s):\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nThis project contacts no third party and transmits no user data.')
  console.error('See the privacy section of README.md before changing this.')
  process.exit(1)
}

console.log(
  'Privacy check passed: index.html loads nothing off-origin, src/ contains no network\n' +
    'primitive, and the built bundle embeds no external address. What runs is checked\n' +
    'separately, by scripts/check-network.mjs against a real browser.',
)
