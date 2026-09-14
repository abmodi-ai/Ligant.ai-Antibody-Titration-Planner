/**
 * One citation, asserted across three documents.
 *
 * A script rather than a test, for the same reason check-style and
 * check-privacy are scripts: it reads files from disk, and the application's
 * TypeScript project targets a browser with no node types, so a test that
 * imports node:fs passes under vitest and fails the typecheck.
 *
 * What this cannot check is stated on success rather than left implied: the
 * manuscript is not readable from here and must be diffed by hand.
 */

import { readFileSync } from 'node:fs'

const cff = readFileSync('CITATION.cff', 'utf8')
const site = readFileSync('src/lib/site.ts', 'utf8')
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

const cffField = (name) =>
  (cff.match(new RegExp(`^${name}:\\s*(.+)$`, 'm')) ?? [])[1]?.trim().replace(/^['"]|['"]$/g, '')

const siteConst = (name) =>
  (site.match(new RegExp(`${name}[^=]*=\\s*['"]([^'"]+)['"]`)) ?? [])[1]

const failures = []
const expect = (what, actual, wanted) => {
  if (actual !== wanted) failures.push(`${what}: ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`)
}

const appVersion = siteConst('APP_VERSION')
const siteUrl = siteConst('SITE_URL')
const toolPath = siteConst('TOOL_PATH')
const repoUrl = siteConst('REPO_URL')

if (!appVersion) failures.push('APP_VERSION not found in src/lib/site.ts')
if (!siteUrl) failures.push('SITE_URL not found in src/lib/site.ts')
if (!toolPath) failures.push('TOOL_PATH not found in src/lib/site.ts')

expect('CITATION.cff version against APP_VERSION', cffField('version'), appVersion)
expect('CITATION.cff repository-code against REPO_URL', cffField('repository-code'), repoUrl)
// The tool's own address, not the site root. C4 is reached at a subpath, and a
// citation that sends a reader to the suite rather than to the tool that
// produced their number is the kind of near-miss this script exists to catch.
expect('CITATION.cff url against the deployed address', cffField('url'), `${siteUrl}${toolPath}`)
expect('package.json version against APP_VERSION', `v${pkg.version}`, appVersion)
expect('package.json license', pkg.license, 'Apache-2.0')
expect('CITATION.cff license', cffField('license'), 'Apache-2.0')

if (!/^\s*-?\s*family-names:\s*Modi\s*$/m.test(cff)) failures.push('CITATION.cff is missing family-names: Modi')
if (!/given-names:\s*A\.B\./.test(cff)) failures.push('CITATION.cff is missing given-names: A.B.')
if (!/affiliation:\s*Ligant AI Incorporated/.test(cff)) {
  failures.push('CITATION.cff is missing affiliation: Ligant AI Incorporated')
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(cffField('date-released') ?? '')) {
  failures.push('CITATION.cff date-released is not a YYYY-MM-DD date')
}

// A placeholder DOI is worse than no DOI: it looks like an identifier and
// resolves to nothing. Absent is the correct state until Zenodo mints one.
if (/10\.5281\/zenodo\.0+\b/.test(cff) || /10\.5281\/zenodo\.0+\b/.test(site)) {
  failures.push('a placeholder Zenodo DOI is present, which is worse than no DOI')
}

if (failures.length > 0) {
  console.error(`Citation check failed with ${failures.length} issue(s):\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nThe footer, CITATION.cff and the manuscript must state one citation.')
  process.exit(1)
}

console.log(
  'Citation check passed: CITATION.cff, package.json and src/lib/site.ts state one version,\n' +
    'one repository, one address and one licence. The manuscript is not readable from\n' +
    'here and must be diffed by hand.',
)
