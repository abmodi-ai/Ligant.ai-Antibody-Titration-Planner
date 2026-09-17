/**
 * The runtime half of the privacy claim, and every assertion that needs a
 * rendered page.
 *
 * TWO JOBS, and the division is the tool set's core convention: pure functions
 * are tested by vitest in node, and anything that needs a DOM, storage, layout
 * or a real browser is tested here. There is no jsdom in this project, by
 * choice: a DOM that is not a browser proves nothing about a page.
 *
 * ACCEPTANCE TEST 17 HAS TWO HALVES AND THIS SCRIPT IS BOTH OF THEM, depending
 * on how it is run:
 *
 *   node scripts/check-network.mjs
 *       serves dist/ locally and drives it. Establishes that the BUILD
 *       ARTEFACT contacts no other origin. This is what `npm run verify` runs.
 *
 *   node scripts/check-network.mjs https://<deployed-address>/
 *       drives the DEPLOYED page. This is what acceptance 17 actually asks
 *       for, and the build-artefact run does not substitute for it: a local
 *       server does not exercise the host, its CDN, or anything a host injects
 *       into a response.
 *
 * The two are held together by NETWORK_CLAIM_VERIFIED in src/lib/site.ts. The
 * footer makes the strong claim only when that flag is set, and this script
 * fails if the flag is set without a written record of a passing deployed run
 * behind it, so the claim cannot go live unrecorded. The record, not this run,
 * is what gates the flag: see the block at NETWORK_RECORD_PATH below for why
 * requiring THIS run to be the deployed one deadlocked and was changed.
 *
 * Requests are RECORDED, NEVER BLOCKED, deliberately. What this proves is that
 * the code never tries to reach another origin at all, which is a stronger
 * statement than that something stopped it.
 */

import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const PORT = 8971
const LOCAL_ORIGIN = `http://localhost:${PORT}`

const target = process.argv[2] ?? null
const isDeployedRun = target !== null
const origin = isDeployedRun ? new URL(target).origin : LOCAL_ORIGIN
const pageUrl = isDeployedRun ? target : `${LOCAL_ORIGIN}/`

const site = readFileSync('src/lib/site.ts', 'utf8')
const constant = (name) => (site.match(new RegExp(`${name}[^=]*=\\s*['"]([^'"]+)['"]`)) ?? [])[1]
const SITE_URL = constant('SITE_URL')
const TOOL_PATH = constant('TOOL_PATH')
const APP_VERSION = constant('APP_VERSION')
const NETWORK_CLAIM_VERIFIED = /NETWORK_CLAIM_VERIFIED\s*=\s*true/.test(site)

if (!SITE_URL || !TOOL_PATH) {
  console.error('FAIL: SITE_URL or TOOL_PATH could not be read from src/lib/site.ts')
  process.exit(1)
}

const failures = []
const fail = (what) => failures.push(what)

/* ---------------------------------------------------------------------- *
 * A static server over dist/, the way a static host resolves paths.       *
 * Not `vite preview`: what is checked has to be the built artefact itself. *
 * ---------------------------------------------------------------------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

let server = null
if (!isDeployedRun) {
  if (!existsSync('dist')) {
    console.error('FAIL: dist/ is not present. Run npm run build first.')
    process.exit(1)
  }
  server = createServer((request, response) => {
    let path = join('dist', decodeURIComponent(request.url.split('?')[0]))
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html')
    if (!existsSync(path)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' })
      response.end('not found')
      return
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' })
    response.end(readFileSync(path))
  })
  await new Promise((resolve) => server.listen(PORT, resolve))
}

const browser = await chromium.launch({
  args: ['--no-sandbox'],
  // An explicitly provided browser where there is one, otherwise the chromium
  // Playwright manages. CI installs that browser itself.
  executablePath: process.env.CHROME_PATH,
})
// URS open item 11, closed at v0.5: the reference viewport is 1366 x 650 CSS
// px. See the `reference-viewport` register row for the browser configuration
// this figure is measured against.
const page = await browser.newPage({ viewport: { width: 1366, height: 650 } })

const foreign = []
page.on('request', (request) => {
  const url = request.url()
  if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) {
    foreign.push(`${request.method()} ${url}`)
  }
})

await page.goto(pageUrl, { waitUntil: 'networkidle' })

/* ---------------------------------------------------------------------- *
 * A reader's way in and out of the page                                   *
 * ---------------------------------------------------------------------- */
if ((await page.locator('main#main').count()) === 0) fail('there is no main landmark')
if ((await page.locator('a.skip-link').count()) === 0) fail('there is no skip link')
if ((await page.locator('.masthead').count()) === 0) fail('there is no masthead')
if ((await page.locator('footer.site-footer').count()) === 0) fail('there is no site footer')
if ((await page.title()) === '') fail('the document has no title')

const navCurrent = await page.locator('.tool-nav [aria-current="page"]').first().textContent().catch(() => null)
if (navCurrent === null) fail('the tool switcher does not mark the current tool')

/*
 * The sibling links must be ABSOLUTE, to https://benchtools.ligant.ai/...,
 * not root-relative. This page is reachable at more than one origin (the
 * router, and the Pages project's own *.pages.dev), and a root-relative link
 * resolves against whichever origin the reader is currently on: correct from
 * the router, a 404 from the raw Pages origin, since that path does not
 * exist on this tool's own project.
 */
const navHrefs = await page.locator('.tool-nav a').evaluateAll((els) => els.map((el) => el.getAttribute('href')))
if (navHrefs.length === 0) fail('the tool switcher has no sibling links to check')
for (const href of navHrefs) {
  if (!href?.startsWith(SITE_URL)) fail(`a tool-switcher link is not absolute to ${SITE_URL}: ${href}`)
}

/* ---------------------------------------------------------------------- *
 * The declarations gate: acceptance 13                                     *
 * ---------------------------------------------------------------------- */
const emptyState = (await page.locator('.rail .empty').textContent().catch(() => '')) ?? ''
if (!/Nothing is computed yet/i.test(emptyState)) {
  fail('an empty form computes something, or does not say that it has not')
}
for (const phrase of ['the stock concentration', 'the staining volume', 'the cell number', 'the top point']) {
  if (!emptyState.includes(phrase)) fail(`the empty state does not say it needs ${phrase}`)
}

/*
 * The pipetting minimum is the one field that is NOT missing from an empty
 * form, and that is C4-SR-05 working rather than a gap in the gate: it is
 * pre-filled at 2 µL and must be VISIBLY MARKED AS A SUGGESTION. The default is
 * on the behaviour path whenever it is unchanged, so what acceptance 13 needs
 * here is not that the field is empty but that the reader can see the tool
 * proposed the number rather than that they chose it.
 */
const prefilled = await page.inputValue('#pipetting-minimum').catch(() => '')
if (prefilled !== '2') fail(`the pipetting minimum is pre-filled with ${prefilled || 'nothing'}, expected 2`)
if ((await page.locator('.suggestion-marker').count()) === 0) {
  fail('the pre-filled pipetting minimum is not visibly marked as a suggestion')
}

/* ---------------------------------------------------------------------- *
 * The reference case of acceptance 1, driven through the real interface    *
 * ---------------------------------------------------------------------- */
/**
 * Reopen a collapsed declaration panel.
 *
 * Panels collapse to a summary once a series exists, which is the layout remedy
 * for C4-NF-03. Driving the interface afterwards therefore has to reopen them,
 * and doing so here means the reopening is exercised on every run rather than
 * assumed: a panel that collapsed and could not be reopened would have hidden a
 * declaration, which is the one thing that remedy must not do.
 */
async function expandPanel(step) {
  const panel = page.locator('.stack > .panel').nth(step - 1)
  const change = panel.getByRole('button', { name: 'Change' })
  if ((await change.count()) > 0) {
    await change.click()
    await page.waitForTimeout(80)
  }
}

async function enterReferenceCase(points = '6') {
  await page.fill('#stock-value', '0.2')
  await page.selectOption('#stock-unit', 'mg/mL')
  await page.selectOption('#stock-mass-basis', 'antibody-protein')
  await page.selectOption('#stock-source', 'certificate-of-analysis')
  await page.fill('#staining-volume', '100')
  await page.fill('#cell-number', '1')
  await page.selectOption('#top-form', '2')
  await page.fill('#top-value', '1')
  await page.fill('#dilution-factor', '2')
  await page.fill('#points', points)
  await page.waitForTimeout(150)
}

/**
 * Nadira's second review, D2. Not the one-flag reference declaration set:
 * this is the four-flag one (C4-FL-01, C4-FL-03, C4-FL-07, C4-FL-08
 * together) that measured 669px at a 947px viewport, taller than the
 * reference viewport itself, before the sticky block was bounded. "Four
 * flags is a user with a different staining volume, a different cell
 * number, a top point below the vendor recommendation and a P2 in hand.
 * That is the target user." The same declaration set is kept permanently in
 * reimpl/fixtures.json as c4-fx-24-four-flag-target-user.
 */
async function enterFourFlagCase(points = '12') {
  await page.fill('#stock-value', '0.2')
  await page.selectOption('#stock-unit', 'mg/mL')
  await page.selectOption('#stock-mass-basis', 'antibody-protein')
  await page.selectOption('#stock-source', 'certificate-of-analysis')

  await page.selectOption('#vendor-basis', 'per-test-volume-stated')
  await page.waitForTimeout(50)
  await page.fill('#vendor-amount', '5')
  await page.fill('#vendor-test-volume', '100')
  await page.selectOption('#vendor-cells-kind', 'stated')
  await page.waitForTimeout(50)
  await page.fill('#vendor-cells', '1')

  await page.fill('#staining-volume', '50')
  await page.fill('#cell-number', '2')
  await page.fill('#pipetting-minimum', '1')

  await page.selectOption('#top-form', '3')
  await page.fill('#top-value', '8')
  await page.fill('#dilution-factor', '2')
  await page.fill('#points', points)
  await page.waitForTimeout(200)
}

await enterReferenceCase()

const firstRow = await page.locator('.series-table tbody tr').first().innerText()
for (const expected of ['5.00', '1.00', '10.0', '20.0']) {
  if (!firstRow.includes(expected)) fail(`the rendered top point is missing ${expected}`)
}
const lastRow = await page.locator('.series-table tbody tr').last().innerText()
for (const expected of ['0.156', '0.0313', '0.313', '640']) {
  if (!lastRow.includes(expected)) fail(`the rendered sixth point is missing ${expected}`)
}

// The column headings name the units they hold. A heading reading ML where the
// column holds microlitres is the defect this pins.
const headings = await page.locator('.series-table thead th').allInnerTexts()
if (!headings.some((h) => h.includes('µL'))) fail('the volume column is not headed in microlitres')
if (headings.some((h) => /\bML\b/.test(h))) {
  fail('a column heading has been uppercased into ML, which names a different unit')
}

// C4-FL-03 names its points, and the rows it names are marked.
const flagText = (await page.locator('.rail .flag').first().innerText().catch(() => '')) ?? ''
if (!flagText.includes('C4-FL-03')) fail('C4-FL-03 is not shown with its reason code')
if (!/point 3/.test(flagText)) fail('C4-FL-03 does not name the points it is about')
if (!/1 in 80\.0 from stock/.test(flagText)) {
  fail('C4-FL-03 does not carry each point with its dilution factor from stock')
}
const flaggedRows = await page.locator('.series-table tbody tr.point-flagged').count()
if (flaggedRows !== 4) fail(`${flaggedRows} rows are marked as flagged, expected 4`)

/* ---------------------------------------------------------------------- *
 * Acceptance 21 to 23: the disclosures, on the tool's own address           *
 * ---------------------------------------------------------------------- */
const body = await page.locator('main').innerText()

// Acceptance 22: the fourteen failure classes.
for (const phrase of [
  'Loss of antibody activity',
  'Absence of Fc receptor blocking',
  'Which binding regime applies',
  'Matrix transfer',
  'Volume accommodation',
  'Dilution convention',
  'Mass-basis mismatch',
  'Saturation',
]) {
  if (!body.includes(phrase)) fail(`the failure classes do not mention ${phrase}`)
}

// Acceptance 21: the register, with the uncharacterised values marked.
for (const phrase of [
  'Minimum reliable pipetting volume',
  'Maximum point count',
  'Displayed precision',
  'Rounding mode at displayed precision',
  'Dilution factor',
  'Staining volume',
  'Round-trip tolerance',
  'Unit-normalisation tolerance',
  'Ratio-test tolerance',
  'Ratio-test sensitivity',
  'C4-NF-03 conformance',
  // C4-CN-01 as amended at v0.5: a tolerance listed as derived is the
  // analytic bound over the stated operation set, and the page must not
  // state a decision (sign-off) that has not been made.
  'Analytic bound:',
  'OPEN, URS open item 6',
  'Displayed precision matches the resolution of the physical act the number drives',
]) {
  if (!body.includes(phrase)) fail(`the constants register does not state ${phrase}`)
}

// Acceptance 23: the three convention statements, on the output.
for (const [what, phrase] of [
  ['C4-OUT-10, the staining volume assumption', 'final volume of the stain, including the antibody'],
  ['C4-OUT-11, the dilution convention', 'final volume divided by stock volume'],
  ['C4-OUT-07, the precision and rounding rule', 'rounded half away from zero'],
  ['C4-OUT-08, what the tool does not verify', 'does not verify what was prepared'],
  ['C4-IV-05, the ratio test\'s blind spot', 'one rounding per step is invisible to it'],
]) {
  if (!body.includes(phrase)) fail(`${what} is not stated on the page`)
}

// C4-OUT-06, the scope statement, and C4-OUT-02, the derivation.
const wholePage = await page.locator('body').innerText()
if (!wholePage.includes('Research use only. Not qualified for GxP decision-making.')) {
  fail('the scope statement of C4-OUT-06 is not displayed')
}
for (const phrase of ['Cell density', 'Stock provenance', 'Stock mass basis', 'Vendor basis', 'Pipetting minimum', 'Engine version']) {
  if (!wholePage.includes(phrase)) fail(`the derivation does not state ${phrase}`)
}
if (!wholePage.includes(APP_VERSION)) fail('the engine version is not stated on the output')

/* ---------------------------------------------------------------------- *
 * Acceptance 25 and C4-NF-03, as restated at v0.5: a series point is never  *
 * read apart from the declarations and flags it was designed under.        *
 * ---------------------------------------------------------------------- *
 *
 * Nadira's second review, D2. Driven against the FOUR-FLAG declaration set
 * (`enterFourFlagCase`), not the one-flag reference case: measured against
 * one flag, this check passed while the block itself, on four flags, was
 * taller than the reference viewport with no declaration in view. Four
 * flags is the ordinary target user, not an edge case, so this is now the
 * fixture the property is measured against.
 *
 * FOURTEEN WINDOW-SCROLL POSITIONS, per acceptance 25 as amended: the page
 * scrolled to its own top, to its own bottom, and with each of the twelve
 * rows aligned to the bottom edge of the viewport. WINDOW scroll and nothing
 * else: an earlier version of this check scrolled `.series-scroll`, the
 * table's own internal region, and never drove window scroll at all, which
 * is exactly how a real failure got certified MET here and then found by
 * Nadira's own review instead. There is no region left to scroll against:
 * the table renders at its natural height, and the declaration line and the
 * flag list (`.series-sticky` in App.tsx) are pinned to the viewport by
 * `position: sticky`, scoped to the table they sit above, for as long as any
 * row of it remains in view under ordinary window scroll.
 *
 * A position where NO row is in view at all is not a position C4-NF-03 makes
 * a claim about: on this page, both "top" (the table sits well below the
 * masthead and the declarations) and "bottom" (well below the table, past
 * the derivation and structured-result panels) are exactly that, so they
 * pass without a decl/flag check. The check applies only where a series
 * point is actually being read, which is the property being measured.
 */
for (const step of [1, 2, 3, 4]) await expandPanel(step)
if ((await page.locator('#points').count()) === 0) {
  fail('a collapsed declaration panel could not be reopened')
} else {
  await enterFourFlagCase('12')
}

const rowCount = await page.locator('.series-table tbody tr').count()
if (rowCount !== 12) fail(`the series has ${rowCount} rows, expected 12 for acceptance 25`)

// The four flags acceptance 25 is measured against, exactly: named, not
// counted, so this cannot pass on the wrong four.
const flagCodesPresent = await page.locator('.rail .flag strong').allInnerTexts()
for (const code of ['C4-FL-01', 'C4-FL-03', 'C4-FL-07', 'C4-FL-08']) {
  if (!flagCodesPresent.includes(code)) fail(`the four-flag fixture did not raise ${code}`)
}
if (flagCodesPresent.length !== 4) {
  fail(`the four-flag fixture raised ${flagCodesPresent.length} flags, expected exactly 4`)
}

/*
 * The spacer, sized on a FRESH load, before any scroll. Reproduced against
 * the dev build: the spacer's inline height stayed 0px until a real
 * mouse-wheel scroll, because the `ResizeObserver`'s first delivery is
 * scheduled for a later frame rather than read synchronously at attach
 * time, and nothing scroll-independent forced a re-measure before it
 * arrived. `window.scrollTo` below does not exercise this: it is a
 * programmatic scroll, and a defect here would still pass a check that
 * only measured the sticky block's fit AFTER scrolling had already
 * triggered a resize. Checked here, before `checkWindowPosition` is called
 * even once.
 */
const spacerHeight = await page.evaluate(() => {
  const el = document.querySelector('.series-sticky-spacer')
  return el === null ? null : el.getBoundingClientRect().height
})
if (spacerHeight === null) fail('the sticky spacer is not present on the page')
else if (spacerHeight <= 0) {
  fail(`the sticky spacer measured ${spacerHeight}px on a fresh load, before any scroll; expected > 0px`)
}

const fullyVisible = (rect, vh) => rect !== null && rect.top >= -0.5 && rect.bottom <= vh + 0.5

async function nf03State() {
  return page.evaluate(() => {
    const rectOf = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    }
    const rows = [...document.querySelectorAll('.series-table tbody tr')].map(rectOf)
    return {
      viewportHeight: window.innerHeight,
      anyRowVisible: rows.some((r) => r.bottom > 0 && r.top < window.innerHeight),
      sticky: rectOf(document.querySelector('.series-sticky')),
    }
  })
}

/**
 * One full sweep of acceptance 25's fourteen positions, returned rather than
 * accumulated into module state, so it can be run twice: once with every
 * flag summary collapsed (the state on load) and once with every one
 * expanded (the state a reviewer produces by reading one). `FlagSummaryList`
 * is supposed to absorb the expansion inside its own 190px scroll without
 * growing `.series-sticky` at all; asserting that rather than inferring it
 * from the CSS is the whole reason this runs twice.
 */
async function sweepWindowPositions() {
  let worstAt = null
  let failures = 0
  let checked = 0

  async function checkWindowPosition(label) {
    await page.waitForTimeout(50)
    const s = await nf03State()
    // Nothing to protect where nothing is being read.
    if (!s.anyRowVisible) return
    checked += 1
    const ok = fullyVisible(s.sticky, s.viewportHeight)
    if (!ok) {
      failures += 1
      if (worstAt === null) worstAt = label
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0))
  await checkWindowPosition('page scrolled to the top')

  const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
  await page.evaluate((y) => window.scrollTo(0, y), maxScroll)
  await checkWindowPosition('page scrolled to the bottom')

  for (let i = 0; i < rowCount; i += 1) {
    // Absolute document position of this row's bottom edge, so the target is
    // independent of wherever the page currently happens to be scrolled.
    const target = await page.evaluate((idx) => {
      const row = document.querySelectorAll('.series-table tbody tr')[idx]
      const rect = row.getBoundingClientRect()
      return Math.max(0, rect.bottom + window.scrollY - window.innerHeight)
    }, i)
    await page.evaluate((y) => window.scrollTo(0, y), target)
    await checkWindowPosition(`row ${i + 1} aligned to the bottom edge`)
  }

  return { worstAt, failures, checked }
}

const collapsedSweep = await sweepWindowPositions()

/*
 * THE OTHER HALF OF C4-NF-03, which this check was missing entirely.
 *
 * Everything above asserts the FLOOR: wherever a series point is read, the
 * declarations are in view. Nothing asserted the CEILING, that the block
 * stops being pinned once there is no longer a point to read. So a build in
 * which the declarations stayed stuck to the top of the viewport for 300px
 * after the last row had left, hanging over flag prose and then over empty
 * page, passed this check on every run and shipped. It was found by a reader
 * scrolling, which is the failure mode this whole section exists to replace.
 *
 * Measured rather than reasoned about: step down the page and find the
 * positions where NO row is in view but the series panel is still on screen.
 * At those positions the block must have released.
 */
const pinnedWithNothingToRead = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.series-table tbody tr')]
  const sticky = document.querySelector('.series-sticky')
  const panel = document.querySelector('.panel-series')
  /*
   * Everything in the stuck region except the runway: the table, the
   * per-form "not computable, and why" list, and the note explaining why
   * two vendor multiples differ. All of those describe the columns of the
   * table directly above them, so the declarations staying pinned while
   * they are read is the same property holding rather than an over-run.
   * Once they have gone too, nothing on screen is what the declarations
   * qualify, and the block must let go.
   *
   * Taken as the last child that is not the spacer, rather than by naming
   * the notes: an earlier version of this check named `.form-notes` alone
   * and missed the vendor-multiples note, reporting a 54px over-run that
   * was really the check looking at the wrong element.
   */
  const region = document.querySelector('.series-stuck-region')
  const tail = [...region.children].filter((el) => !el.classList.contains('series-sticky-spacer')).pop()
  const stuckAt = []
  const limit = document.documentElement.scrollHeight - window.innerHeight
  for (let y = 0; y <= limit; y += 25) {
    window.scrollTo(0, y)
    const panelRect = panel.getBoundingClientRect()
    // Only positions where the panel is still on screen: past it the block
    // has scrolled away with its own panel and says nothing either way.
    if (panelRect.bottom <= 0 || panelRect.top >= window.innerHeight) continue
    const anyRow = rows.some((r) => {
      const q = r.getBoundingClientRect()
      return q.bottom > 0 && q.top < window.innerHeight
    })
    if (anyRow) continue
    // Still something of the table's own explanation on screen.
    if (tail.getBoundingClientRect().bottom > 0) continue
    const top = sticky.getBoundingClientRect().top
    // Pinned means sitting at its `top` offset rather than scrolling with
    // the page. 16px, with a couple of px of tolerance for subpixel layout.
    if (Math.abs(top - 16) < 2) stuckAt.push(y)
  }
  window.scrollTo(0, 0)
  return stuckAt
})
if (pinnedWithNothingToRead.length > 0) {
  const span = `${pinnedWithNothingToRead[0]}px to ${pinnedWithNothingToRead[pinnedWithNothingToRead.length - 1]}px`
  fail(
    `C4-NF-03: the declaration block is still pinned at ${pinnedWithNothingToRead.length} scroll ` +
      `positions (${span}) where neither a series row nor the table's own notes are in view. It ` +
      'must release once there is no point being read, not stay stuck over whatever follows the table.',
  )
}

await page.locator('.flag-summary summary').evaluateAll((els) => els.forEach((el) => el.click()))
await page.waitForTimeout(100)
const openDetails = await page.locator('.flag-summary[open]').count()
if (openDetails !== 4) fail(`clicking every flag summary opened ${openDetails} of it, expected 4`)
const expandedSweep = await sweepWindowPositions()

const nf03Checked = collapsedSweep.checked
const nf03Failures = collapsedSweep.failures + expandedSweep.failures
const worstAt =
  collapsedSweep.worstAt !== null
    ? `${collapsedSweep.worstAt} (flag summaries collapsed)`
    : expandedSweep.worstAt !== null
      ? `${expandedSweep.worstAt} (flag summaries expanded)`
      : null

if (nf03Checked === 0) {
  fail('acceptance 25 found no window-scroll position at which any series row was in view')
}
const layoutNote =
  nf03Failures === 0
    ? `C4-NF-03 at the reference viewport (1366 x 650), four-flag fixture: MET, under window scroll, at all ${nf03Checked} of acceptance 25's positions where a row was in view, with every flag summary collapsed and again with every one expanded.`
    : `C4-NF-03 at the reference viewport, four-flag fixture: NOT MET, under window scroll, at ${nf03Failures} of ${nf03Checked * 2} checked positions across both expansion states, first at "${worstAt}".`
if (nf03Failures > 0) {
  fail(`C4-NF-03 is not met at ${nf03Failures} of ${nf03Checked * 2} window-scroll acceptance-25 positions (collapsed + expanded) on the four-flag fixture (first: ${worstAt})`)
}
// The register row is checked specifically, not as a substring of the whole
// page: a page-wide MEASURED elsewhere must not wave this row through, and a
// page-wide OPEN elsewhere must not fail it either.
const nf03Row = await page.locator('.register-table tr', { hasText: 'C4-NF-03 conformance' }).innerText()
if (nf03Failures === 0) {
  if (!nf03Row.includes('MEASURED') || nf03Row.includes('re-measurement')) {
    fail('C4-NF-03 fits at the reference viewport on the four-flag fixture, but the register row does not say MEASURED')
  }
} else if (!nf03Row.includes('OPEN')) {
  fail('C4-NF-03 does not fit at the reference viewport on the four-flag fixture, but the register row does not say OPEN')
}

/* ---------------------------------------------------------------------- *
 * Every key written is a key disclosed                                     *
 * ---------------------------------------------------------------------- */
const storage = await page.evaluate(() => ({
  local: Object.keys(window.localStorage),
  session: Object.keys(window.sessionStorage),
}))
const disclosed = await page.locator('code').allInnerTexts()
for (const key of storage.local) {
  if (!disclosed.includes(key)) fail(`the page writes ${key} without disclosing it`)
}
if (storage.session.length > 0) {
  fail(`the page writes sessionStorage: ${storage.session.join(', ')}`)
}

/* ---------------------------------------------------------------------- *
 * The input-guidance instruction, acceptance T1 to T12                     *
 * ---------------------------------------------------------------------- *
 *
 * Guidance moved out of paragraphs under each control and behind a trigger
 * on its label (C4-OUT-12), and the state markers went from unexplained
 * amber chips to quiet, explained, clearable annotations. Both are page copy
 * and interaction on a deployed tool, so both are measured here, in a real
 * browser, rather than asserted.
 */

/* T2. No inline help paragraph longer than eight words remains under an
 * input. Scoped to the four declaration panels: the Method panel below them
 * is prose by design and is not an input, and the results column is not
 * "under an input" either. `.field-note`, the message explaining that a top
 * point was CLEARED, is deliberately not `.hint`: it says what happened to a
 * value, not what to put in the field. */
for (let step = 1; step <= 4; step += 1) {
  const hints = await page.locator('.stack > .panel').nth(step - 1).locator('p.hint').allInnerTexts()
  for (const hint of hints) {
    const words = hint.trim().split(/\s+/).length
    if (words > 8) fail(`T2: declaration panel ${step} still carries a ${words}-word inline hint`)
  }
}

/*
 * T1. Every field the instruction lists has a trigger, and the copy behind it
 * is the copy that was specified. Read from src/lib/guidance.ts textually,
 * the same way this script already reads src/lib/site.ts, because the page's
 * own rendering is exactly what is being checked and cannot also be the
 * reference for it.
 */
const guidanceSource = readFileSync('src/lib/guidance.ts', 'utf8')
const guidance = {}
{
  const body = guidanceSource.slice(guidanceSource.indexOf('FIELD_GUIDANCE'))
  const entry = /^\s*'?([a-z-]+)'?:\s*$|^\s*'?([a-z-]+)'?:\s*'((?:[^'\\]|\\.)*)',?\s*$/gm
  let match
  while ((match = entry.exec(body)) !== null) {
    if (match[2] !== undefined) {
      guidance[match[2]] = match[3]
    } else {
      // Key on its own line, value on the next.
      const rest = body.slice(entry.lastIndex)
      const value = /^\s*'((?:[^'\\]|\\.)*)',?\s*$/m.exec(rest)
      if (value !== null) guidance[match[1]] = value[1]
    }
  }
}
const guidedIds = Object.keys(guidance)
if (guidedIds.length < 18) fail(`T1: only ${guidedIds.length} guidance entries were parsed, expected 18`)

for (const id of guidedIds) {
  const trigger = page.locator(`[data-help-for="${id}"]`)
  if ((await trigger.count()) === 0) {
    fail(`T1: the field ${id} has no guidance trigger`)
    continue
  }
  // T5: the accessible name names the field it is about.
  const name = await trigger.first().getAttribute('aria-label')
  if (name === null || !name.startsWith('What goes in this field')) {
    fail(`T1/T5: the trigger for ${id} has no accessible name naming its field, got ${name}`)
  }
  await trigger.first().click()
  await page.waitForTimeout(40)
  const shown = (await page.locator('.field-help-panel').first().innerText().catch(() => '')) ?? ''
  if (shown.trim() !== guidance[id].trim()) {
    fail(`T1: the guidance shown for ${id} is not the copy specified for it`)
  }
  // T6: entirely inside the reference viewport.
  const box = await page.locator('.field-help-panel').first().boundingBox()
  if (box === null) {
    fail(`T6: the guidance panel for ${id} has no box`)
  } else if (box.x < 0 || box.y < 0 || box.x + box.width > 1366 || box.y + box.height > 650) {
    fail(
      `T6: the guidance panel for ${id} renders outside the reference viewport ` +
        `(x ${Math.round(box.x)}, y ${Math.round(box.y)}, w ${Math.round(box.width)}, h ${Math.round(box.height)})`,
    )
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(40)
}

/* T4. Opening one closes any other. */
await page.locator('[data-help-for="staining-volume"]').first().click()
await page.waitForTimeout(40)
await page.locator('[data-help-for="cell-number"]').first().click()
await page.waitForTimeout(40)
const openPanels = await page.locator('.field-help-panel').count()
if (openPanels !== 1) fail(`T4: ${openPanels} guidance panels were open at once, expected 1`)

/* T3 and T5. Keyboard open, focus into the panel, Escape closes, focus back
 * on the trigger. A `<button>` fires click for Enter and for Space natively,
 * so the keyboard path is the same path, which is the point of using one. */
await page.keyboard.press('Escape')
await page.waitForTimeout(40)
await page.locator('[data-help-for="points"]').first().focus()
await page.keyboard.press('Enter')
await page.waitForTimeout(60)
if ((await page.locator('.field-help-panel').count()) !== 1) {
  fail('T3: Enter on a focused guidance trigger did not open its panel')
}
const focusedIsPanel = await page.evaluate(() =>
  document.activeElement?.classList.contains('field-help-panel'),
)
if (focusedIsPanel !== true) fail('T5: focus did not move into the guidance panel on open')
await page.keyboard.press('Escape')
await page.waitForTimeout(60)
if ((await page.locator('.field-help-panel').count()) !== 0) {
  fail('T3: Escape did not close the guidance panel')
}
const focusReturned = await page.evaluate(
  () => document.activeElement?.getAttribute('data-help-for') ?? null,
)
if (focusReturned !== 'points') fail('T5: focus did not return to the trigger when the panel closed')

/* T3. Space opens, and a second press of the trigger closes it again. */
await page.keyboard.press(' ')
await page.waitForTimeout(60)
if ((await page.locator('.field-help-panel').count()) !== 1) {
  fail('T3: Space on a focused guidance trigger did not open its panel')
}
await page.locator('[data-help-for="points"]').first().click()
await page.waitForTimeout(60)
if ((await page.locator('.field-help-panel').count()) !== 0) {
  fail('T3: clicking the trigger again did not close its panel')
}

/* T3. A pointer press outside closes it, and returns focus. */
await page.locator('[data-help-for="points"]').first().click()
await page.waitForTimeout(60)
await page.locator('h1').first().click()
await page.waitForTimeout(60)
if ((await page.locator('.field-help-panel').count()) !== 0) {
  fail('T3: a click outside did not close the guidance panel')
}

/* T7. No guidance sentence reaches the structured object shown on the page.
 * The unit tests pin the same property against `notebookLine` and `toJson`;
 * this is the rendered half of it. */
const structured = (await page.locator('.options pre').first().innerText().catch(() => '')) ?? ''
for (const id of guidedIds) {
  const fingerprint = guidance[id].split(' ').slice(0, 9).join(' ')
  if (structured.includes(fingerprint)) {
    fail(`T7: the guidance for ${id} appears in the structured result on the page`)
  }
}

/* ---------------------------------------------------------------------- *
 * T8 to T11, and C4-ST-03: what a restored value looks like               *
 * ---------------------------------------------------------------------- *
 *
 * SEEDED WITH THE OLDER STORED SHAPE, deliberately. Typing a value now
 * records it as confirmed, so a document this session wrote comes back with
 * nothing to mark, which is T10 working rather than a gap. The state under
 * test here is the one a reader of the currently-deployed build actually
 * has: values in storage, no confirmations recorded against them.
 */
const LEGACY_DOCUMENT = {
  stockKind: 'stated', stockValue: '0.2', stockUnit: 'mg/mL',
  stockMassBasis: 'antibody-protein', stockSource: 'certificate-of-analysis',
  vendorBasis: 'per-test-volume-stated', vendorAmountKind: 'volume',
  vendorAmountValue: '5', vendorAmountUnit: 'uL',
  vendorTestVolume: '100', vendorTestVolumeUnit: 'uL',
  vendorConcentrationKind: 'concentration', vendorConcentrationValue: '', vendorConcentrationUnit: 'ug/mL',
  vendorCellsKind: 'stated', vendorCells: '1', vendorCellsUnit: 'cells-1e6',
  stainingVolume: '50', stainingVolumeUnit: 'uL',
  cellNumber: '2', cellNumberUnit: 'cells-1e6',
  pipettingMinimum: '1', pipettingMinimumEntered: true,
  topForm: '3', topValue: '8', topVolumeUnit: 'uL', topConcentrationUnit: 'ug/mL',
  dilutionFactor: '2', points: '12',
}
await page.evaluate(
  ([key, doc]) => localStorage.setItem(key, JSON.stringify(doc)),
  ['c4.state.v1', LEGACY_DOCUMENT],
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)

/* T8. The explanation appears once, and every carried-over value is marked. */
const notes = await page.locator('.retention-note').count()
if (notes !== 1) fail(`T8: the retention explanation appears ${notes} times, expected exactly 1`)
const markedOnLoad = await page.locator('.retained-marker').count()
if (markedOnLoad === 0) {
  fail('T8, and C4-ST-03: values were restored from storage with nothing marked as carried over')
}
const railMarkedOnLoad = await page.locator('.rail-declarations .retained-marker').count()
if (railMarkedOnLoad === 0) {
  fail('T8: the declaration line beside the series marks nothing as carried over')
}

/* T11. C4-NF-03 still holds with the markers and the explanation line in
 * place. The markers are IN the sticky declaration line, which has no scroll
 * of its own, so this is measured rather than assumed. */
const stickyWithMarkers = await page.locator('.series-sticky').boundingBox()
if (stickyWithMarkers === null) {
  fail('T11: the sticky declaration block is not present with a restored document')
} else if (stickyWithMarkers.height > 650) {
  fail(
    `T11: with retained markers the sticky block is ${Math.round(stickyWithMarkers.height)}px, ` +
      'taller than the 650px reference viewport',
  )
}
const markedSweep = await sweepWindowPositions()
if (markedSweep.failures > 0) {
  fail(
    `T11: C4-NF-03 is not met with retained markers present, at ${markedSweep.failures} of ` +
      `${markedSweep.checked} positions (first: ${markedSweep.worstAt})`,
  )
}
const layoutNoteMarkers =
  `C4-NF-03 with a restored document, every declaration marked as carried over: MET, sticky block ` +
  `${Math.round(stickyWithMarkers?.height ?? 0)}px at the reference viewport, at all ${markedSweep.checked} ` +
  'acceptance-25 positions where a row was in view.'

/* T9. Confirming a panel clears its marks, in the panel and in the results
 * declaration line, in one action, and leaves every other panel alone. */
await page.evaluate(() => window.scrollTo(0, 0))
const beforeConfirm = await page.locator('.retained-marker').count()
const confirmButtons = await page.locator('button.confirm-values').count()
if (confirmButtons === 0) fail('T9: there is no control to confirm a panel of restored values')
await page.locator('button.confirm-values').first().click()
await page.waitForTimeout(200)
const afterConfirm = await page.locator('.retained-marker').count()
if (!(afterConfirm < beforeConfirm)) {
  fail(`T9: confirming a panel did not clear any marker (${beforeConfirm} before, ${afterConfirm} after)`)
}
if (afterConfirm === 0) {
  fail('T9: confirming one panel cleared every marker on the page, not only its own panel’s')
}

/* T10. The confirmation survives a reload: the marks it cleared stay clear,
 * and the ones it did not stay marked. This is the property a per-load
 * recomputation of retention gets wrong, and the reason confirmation is
 * persisted rather than held in memory. */
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
const afterReload = await page.locator('.retained-marker').count()
if (afterReload !== afterConfirm) {
  fail(
    `T10: confirmation did not survive a reload (${afterConfirm} markers before, ${afterReload} after)`,
  )
}
if (afterReload === 0) {
  fail('T10: a reload cleared every marker, including ones that were never confirmed')
}

/* T12. The required disclosures are still on the page, none of them moved
 * behind a trigger. Re-read after the reload, and asserted against the same
 * phrases the earlier sections check, so a disclosure quietly relocated into
 * a tooltip fails here rather than being noticed by a reader. */
const disclosuresAfter = await page.locator('body').innerText()
for (const [what, phrase] of [
  ['C4-OUT-06, the scope statement', 'Research use only. Not qualified for GxP decision-making.'],
  ['C4-FC-01, the failure classes', 'Loss of antibody activity'],
  ['C4-CN-01, the constants register', 'Minimum reliable pipetting volume'],
  ['C4-OUT-10, the staining-volume convention', 'final volume of the stain, including the antibody'],
  ['C4-OUT-11, the dilution convention', 'final volume divided by stock volume'],
  ['C4-OUT-07, precision and rounding', 'rounded half away from zero'],
  ['the privacy statement', 'Your data stays in your browser'],
]) {
  if (!disclosuresAfter.includes(phrase)) {
    fail(`T12: ${what} is no longer visible on the page`)
  }
}

// "Clear stored data" means what it says: the key is gone, not rewritten empty.
await page.getByRole('button', { name: 'Clear stored data' }).click()
await page.waitForTimeout(150)
const remaining = await page.evaluate(() => Object.keys(window.localStorage))
if (remaining.length > 0) fail(`clearing stored data left ${remaining.join(', ')} behind`)

/* ---------------------------------------------------------------------- *
 * Metadata, robots and the licence                                         *
 * ---------------------------------------------------------------------- */
const meta = await page.evaluate(() => ({
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
  ogUrl: document.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null,
  ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null,
  twitterImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ?? null,
  themeColour: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
}))
for (const [name, value] of Object.entries(meta)) {
  if (value === null) fail(`the document has no ${name}`)
}
for (const [name, value] of [['og:image', meta.ogImage], ['twitter:image', meta.twitterImage]]) {
  // A relative social image yields a preview card with no image.
  if (value !== null && !/^https?:\/\//.test(value)) fail(`${name} is relative, not absolute`)
}
for (const [name, value] of Object.entries(meta)) {
  if (name === 'themeColour' || value === null) continue
  if (!value.startsWith(SITE_URL)) fail(`${name} does not point at ${SITE_URL}`)
}

if (!isDeployedRun) {
  const robots = await (await fetch(`${origin}/robots.txt`)).text()
  if (!/^User-agent:\s*\*/m.test(robots)) fail('robots.txt names no user agent')
  if (!/^Allow:\s*\/\s*$/m.test(robots)) fail('robots.txt allows nothing')
  if (/^Disallow:\s*\S+/m.test(robots)) fail('robots.txt disallows something')
  if (!robots.includes(`Sitemap: ${SITE_URL}${TOOL_PATH}sitemap.xml`)) {
    fail('robots.txt does not point at this tool’s sitemap')
  }

  const licence = await fetch(`${origin}/LICENSE`)
  if (!licence.ok) fail('GET /LICENSE did not succeed, so the footer links nothing')
  else if (!(await licence.text()).includes('Apache License')) {
    fail('/LICENSE is served but does not contain the Apache License')
  }
}

const footer = await page.locator('footer.site-footer').innerText()
for (const phrase of ['Apache License, Version 2.0', 'Modi', 'Ligant AI Incorporated', '3675 Market Street', 'hello@ligant.ai', APP_VERSION]) {
  if (!footer.includes(phrase)) fail(`the footer does not state ${phrase}`)
}
if (footer.includes('theLICENSE')) fail('the LICENSE link has swallowed the space beside it')
if ((await page.locator('footer.site-footer a[href$="LICENSE"]').count()) === 0) {
  fail('the footer does not link the LICENSE it asserts')
}

/*
 * The claim about the deployed address, and the flag that gates it.
 *
 * Open item 18. The previous version of this check failed whenever the flag
 * was true AND the run was local, on the reasoning that a local run cannot
 * itself establish a deployed-address claim. True, but it deadlocked `npm
 * run verify`: the very next local run, AFTER a genuine deployed pass had
 * set the flag correctly, failed for being local, which blocks the deploy
 * that would ship that correctly-set flag.
 *
 * A local run still cannot ESTABLISH the claim, so it does not get to
 * decide the flag is fine on its own say-so either. What it can check,
 * exactly as well as a deployed run can, is whether a WRITTEN RECORD of a
 * passing deployed run backs the flag, in the same idiom this project's
 * other open items use. Requiring that record, rather than requiring THIS
 * run to be the deployed one, is what removes the deadlock without removing
 * the guarantee: the strong claim still cannot go live on an unrecorded
 * local run, and now cannot go live on an unrecorded deployed run either.
 */
const NETWORK_RECORD_PATH = 'docs/open-item-17-deployed-network-verification.md'
if (NETWORK_CLAIM_VERIFIED) {
  if (!existsSync(NETWORK_RECORD_PATH)) {
    fail(
      `NETWORK_CLAIM_VERIFIED is set but ${NETWORK_RECORD_PATH} does not exist. Record the passing ` +
        'deployed-address run there (this script prints exactly that record when it passes against a ' +
        'deployed address) before the flag may be set.',
    )
  } else {
    const record = readFileSync(NETWORK_RECORD_PATH, 'utf8')
    if (!record.includes('ACCEPTANCE TEST 17: PASSED')) {
      fail(`${NETWORK_RECORD_PATH} exists but does not record an ACCEPTANCE TEST 17: PASSED result`)
    }
    if (!record.includes(`${SITE_URL}${TOOL_PATH}`)) {
      fail(`${NETWORK_RECORD_PATH} does not name the deployed address the pass was recorded against`)
    }
  }
}
/*
 * A structural check on top of the record check above: the footer's claim is
 * a ternary keyed on NETWORK_CLAIM_VERIFIED (SiteFooter.tsx), which already
 * guarantees the rendered text cannot disagree with the flag. This asserts
 * that guarantee held, rather than trusting it: a future edit could replace
 * the ternary with a hardcoded string and still pass every check above.
 */
if (NETWORK_CLAIM_VERIFIED) {
  if (!footer.includes('confirmed against the page as served')) {
    fail('NETWORK_CLAIM_VERIFIED is set but the footer does not state the deployed-address-confirmed claim')
  }
} else if (footer.includes('confirmed against the page as served')) {
  fail('the footer claims a deployed-address confirmation that has not been recorded')
}

/* ---------------------------------------------------------------------- *
 * The typefaces are here, and they are ours                                *
 * ---------------------------------------------------------------------- */
const fonts = await page.evaluate(async () => {
  await document.fonts.ready
  return {
    inter: document.fonts.check('16px Inter'),
    plex: document.fonts.check('16px "IBM Plex Mono"'),
  }
})

await browser.close()
if (server !== null) server.close()

/* ---------------------------------------------------------------------- */

let failed = false

if (foreign.length > 0) {
  console.error(`FAIL: the page contacted ${foreign.length} external origin(s):`)
  for (const request of foreign) console.error(`  ${request}`)
  failed = true
}
if (!fonts.inter || !fonts.plex) {
  console.error('FAIL: a self-hosted typeface did not load.')
  console.error(`  Inter: ${fonts.inter}, IBM Plex Mono: ${fonts.plex}`)
  failed = true
}
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} regression(s):`)
  for (const failure of failures) console.error(`  ${failure}`)
  failed = true
}

if (failed) process.exit(1)

console.log(
  `Network check passed against ${isDeployedRun ? 'the deployed address' : 'the build artefact'}, at ${pageUrl}.\n` +
    'The page requested nothing from any origin but its own. Both self-hosted typefaces loaded.\n' +
    'Every storage key written is disclosed on the page, nothing survives a reload unmarked, and\n' +
    'clearing stored data removes the key rather than rewriting it empty. The reference case of\n' +
    'acceptance 1 renders the values URS section 16 states, C4-FL-03 names its points and marks\n' +
    'their rows, and the failure classes, the constants register and the three convention\n' +
    'statements are all on the page.\n' +
    layoutNote +
    '\n' +
    layoutNoteMarkers +
    '\n' +
    (isDeployedRun
      ? `ACCEPTANCE TEST 17: PASSED, at ${pageUrl}, ${new Date().toISOString()}.\n` +
        `Record this pass in ${NETWORK_RECORD_PATH} (date, address, this PASSED line), THEN set\n` +
        'NETWORK_CLAIM_VERIFIED in src/lib/site.ts and redeploy. The record has to exist first: the next\n' +
        'local `npm run verify`, after the flag is set, checks for it rather than for this run having been\n' +
        'the deployed one, which is what lets that local run pass at all.'
      : 'ACCEPTANCE TEST 17 IS NOT SATISFIED BY THIS RUN. It asks for the deployed address, which a\n' +
        'local server cannot stand in for. Deploy, then run:\n' +
        `  node scripts/check-network.mjs ${SITE_URL}${TOOL_PATH}`),
)
