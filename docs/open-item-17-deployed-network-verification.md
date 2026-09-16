# Open item 18 / acceptance test 17: the deployed-address network verification record

| Field | Value |
|---|---|
| URS | C4-NF-01, acceptance test 17 |
| Status | **PASSED, recorded** |
| Owner | Developer |
| Date | 16 September 2026 |

C4-NF-01 is a claim about the page as SERVED, not about the build artefact: a
local server over `dist/` does not exercise the host or its CDN, and what a
host inserts into a response afterwards is a real failure mode, not a
hypothetical one. Acceptance test 17 is the only thing that establishes it,
and this file is that record, kept in the idiom this project's other open
items use, rather than left as a claim with nothing behind it.

**This record exists because `scripts/check-network.mjs` requires it before
`NETWORK_CLAIM_VERIFIED` may be set (open item 18).** A local run cannot
itself establish the deployed-address claim, and does not get to decide the
flag is fine on its own say-so; what it can check, exactly as well as a
deployed run can, is whether a record like this one backs the flag.

## The run

```
node scripts/check-network.mjs https://benchtools.ligant.ai/antibody-titration-planner/
```

Driven against the actual address users reach, through the router, not
against the raw `*.pages.dev` origin the Pages project also serves. Monitoring
(`page.on('request', ...)`) was registered before `page.goto()`, so no request
issued during navigation or first paint could have gone uncounted.

Output:

```
Network check passed against the deployed address, at https://benchtools.ligant.ai/antibody-titration-planner/.
The page requested nothing from any origin but its own. Both self-hosted typefaces loaded.
Every storage key written is disclosed on the page, nothing survives a reload unmarked, and
clearing stored data removes the key rather than rewriting it empty. The reference case of
acceptance 1 renders the values URS section 16 states, C4-FL-03 names its points and marks
their rows, and the failure classes, the constants register and the three convention
statements are all on the page.
C4-NF-03 at the reference viewport (1366 x 650), four-flag fixture: MET, under window scroll, at all 13 of acceptance 25's positions where a row was in view, with every flag summary collapsed and again with every one expanded.
ACCEPTANCE TEST 17: PASSED, at https://benchtools.ligant.ai/antibody-titration-planner/, 2026-09-16T14:54:09.575Z.
```

## Re-run, 16 September 2026, after the input-guidance rework

Re-run against the same address after the guidance tooltips and the state
markers shipped, because acceptance 17 is a claim about the page as served
and that page changed:

```
ACCEPTANCE TEST 17: PASSED, at https://benchtools.ligant.ai/antibody-titration-planner/, 2026-09-16T15:36:53.126Z.
```

The same run carried acceptance T1 to T12 of the input-guidance instruction,
and both C4-NF-03 measurements: the four-flag fixture in each flag expansion
state, and a restored document with every declaration marked as carried over
(sticky block 208 px against 187 px unmarked, MET at all thirteen positions).

## Context: the standing Cloudflare bot-challenge

For most of this project's build, `benchtools.ligant.ai` and its subpaths
returned a Cloudflare bot-challenge ("Just a moment...", HTTP 403) to both
`curl` and this script's real-browser requests, confirmed present on sibling
Ligant Bench Tools too and therefore a zone-level Cloudflare setting rather
than anything specific to this deployment. That blocker cleared between the
previous check (403, earlier the same day) and this run (200, then a full
pass under a real browser). Nothing in this codebase changed that; it is
recorded here because it is what made this run possible, not as something
this project fixed.

## What this does not establish

Acceptance 17 is a snapshot, taken once, against the address as it responded
at the time above. It does not establish that no future deploy, no future
Cloudflare configuration change, and no future host-side injection will alter
what is served; C4-NF-01's own statement on the page is careful to say
"has been verified", not "is guaranteed to remain".
