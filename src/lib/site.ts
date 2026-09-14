/**
 * Where the suite lives, what is in it, and what this tool is called.
 *
 * Single source of truth for all three. The navigation, the sitemap, the
 * canonical link and the social metadata are derived from this, so adding a
 * tool cannot leave the sitemap or the tool switcher behind. Plain data with no
 * browser dependency, because the build imports it too.
 *
 * The three check scripts read this file TEXTUALLY, by regular expression,
 * because they are plain Node and this project's TypeScript targets a browser
 * with no node types. That constrains the formatting as well as the contents:
 * every constant below is assigned a single-quoted string literal on a line the
 * regex can reach, and every TOOLS entry is a one-line object literal with `id`
 * before `path` and no nested braces. A reformat that wraps one of these across
 * two lines does not fail the typecheck; it makes a check silently stop finding
 * what it is checking.
 */

export const SITE_URL = 'https://benchtools.ligant.ai'

/**
 * The slug, decided 14 September 2026, closing URS open item 12.
 *
 * It becomes citable the moment it is public, so it is written once here and
 * referenced everywhere rather than repeated across metadata, the footer and
 * the checks. The siblings are `/molarity-converter/` and
 * `/antigen-density-calculator/`: both spell the tool's full name, so this one
 * does too. `/antibody-titration/` was proposed in the build brief and would
 * have been the only abbreviated slug in the set.
 */
export const TOOL_PATH = '/antibody-titration-planner/'

/** The one address acceptance test 17 is about. */
export const DEPLOYED_URL = `${SITE_URL}${TOOL_PATH}`

export const TOOL_ID = 'C4'
export const TOOL_NAME = 'Antibody Titration Planner'

/** The specification this build is written against. Stated on the page. */
export const URS_VERSION = '0.4'

/**
 * The engine version stamped on every output, per C4-NF-06.
 *
 * Bumped whenever calculation behaviour changes, which is not the same event as
 * a change to the shape of the structured object: that carries its own version
 * in `serialise.ts`. Versioning the two together would make one of them lie.
 */
export const APP_VERSION = 'v0.1.0'

/** The year the citation carries. Fixed, not read from the clock, so the page
 *  renders the same for every reader and for every build. */
export const RELEASE_YEAR = 2026

export const REPO_URL: string | null =
  'https://github.com/abmodi-ai/Ligant.ai-Antibody-Titration-Planner'

/**
 * The Zenodo concept DOI, once the tagged release is archived.
 *
 * Null until minted. A placeholder that looks like an identifier is worse than
 * an absent one, and `scripts/check-citation.mjs` fails the build on a zeroed
 * Zenodo DOI for exactly that reason.
 */
export const CITATION_DOI: string | null = null

/**
 * Whether acceptance test 17 has been run against the DEPLOYED address.
 *
 * C4-NF-01 is an environment claim about the served page, and acceptance 17 is
 * the only thing that can establish it. A local server over `dist/` does not
 * exercise the host or the CDN path, so the strong claim is gated on this flag
 * and the flag is a deployment step rather than a build step:
 *
 *   1. Deploy.
 *   2. `node scripts/check-network.mjs https://<deployed-address>/`, which must
 *      print ACCEPTANCE TEST 17: PASSED.
 *   3. Only then set this to `true`, and redeploy.
 *
 * `scripts/check-network.mjs` enforces the pairing in the other direction: if
 * this is `true` and the run is local, the check fails, so the claim cannot go
 * live on the strength of a local run. Until then the footer states what is
 * actually established, which is a static scan and a real browser against the
 * build artefact, and says the deployed address is unverified.
 */
export const NETWORK_CLAIM_VERIFIED = false

export interface Tool {
  id: string
  /** Label in the tool switcher. */
  name: string
  /** Path from the site root, always with a trailing slash. */
  path: string
  /** Relative priority in the sitemap. */
  priority: number
}

/**
 * The suite, as this tool's navigation presents it.
 *
 * C4 is the first tool in the set with siblings to link, so it is the first to
 * render the `.tool-nav` pills the shared stylesheet has always carried. The
 * sitemap this build emits covers this tool's own page; the sibling entries are
 * here so a reader can reach them, and carry a lower priority to say which page
 * this deployment is.
 */
export const TOOLS: readonly Tool[] = [
  { id: 'antibody-titration', name: 'Antibody titration', path: '/antibody-titration-planner/', priority: 1.0 },
  { id: 'molarity', name: 'Molarity', path: '/molarity-converter/', priority: 0.8 },
  { id: 'antigen-density', name: 'Antigen density', path: '/antigen-density-calculator/', priority: 0.8 },
] as const

export type ToolId = (typeof TOOLS)[number]['id']

/** Absolute URL for a path within the site. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
