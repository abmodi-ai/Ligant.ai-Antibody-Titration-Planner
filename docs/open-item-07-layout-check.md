# Open item 7: the one-screen requirement, measured

| Field | Value |
|---|---|
| URS | C4 v0.4, C4-NF-03, C4-SR-04, acceptance 25, open item 7 |
| Status | **SUPERSEDED at v0.5 (A1). Kept as the historical record of the finding that led to the restatement** |
| Owner | Developer |
| Date | 14 September 2026 |
| Depends on | Open item 11, the reference viewport, still undeclared |

**Superseded, not retracted.** v0.5's A1 restated C4-NF-03 as the property it
protected, a series point is never read apart from the declarations and flags
it was designed under, rather than the one-screen proxy this document measures
below. The finding that the proxy is unmeetable at any laptop viewport, and
that reducing the point cap does not help, is what drove that restatement, and
is kept here for that reason. It is no longer the requirement the tool is
built against.

**Revised 15 September 2026.** The paragraph this replaced described the
region-scroll measurement built at v0.5's first pass: a bounded, internally
scrollable region around the series table (`.series-scroll`), with the
declaration summaries and the flag list held fixed outside it. That
measurement was wrong, not in its arithmetic but in its premise. Nadira's
review scrolled the actual window, not that region, and found that from
roughly 600px of window scroll, every row and the C4-FL-03 flag were visible
with no declaration in view anywhere: the declaration summaries live in the
left column (`.stack`) and the series and flags live in the right column
(`.rail`), two independently-scrolling regions, and bounding the table's own
internal scroll did nothing to keep those two columns together under window
scroll, because window scroll was never what it was measuring.

The CURRENT measurement, against the restated requirement and the closed
reference viewport (1366 x 650 CSS px), is the `nf-03-conformance` register
row and the acceptance-25 section of `scripts/check-network.mjs`, rewritten to
drive **window scroll only**, with no internal scroll region left anywhere on
the page. The mechanism is `.series-sticky` in `App.tsx`: a compact
declaration line (staining volume, cell number, vendor basis, stock mass
basis, pipetting minimum, each individually marked if retained from a
previous session) sits directly above the series table, inside the same
block as the flag list, and that whole block is `position: sticky`, scoped to
the table it describes rather than to the page. It stays in the viewport for
as long as any row of that table does, under ordinary window scroll, because
the table is what it sticks against, not the page. The series panel's
enclosing `.panel` trades its corner-clipping `overflow: hidden` for
`overflow: visible` to allow this (`.panel-series` in `styles.css`), which is
what lets the sticky block track the true viewport rather than being capped
by the panel's own auto-fitted height. Acceptance 25's fourteen positions
(page at its own top, at its own bottom, and each of the twelve rows aligned
to the viewport's bottom edge) are checked at whichever of those actually
show a row in view; the reference declaration set (0.2 mg/mL,
certificate-of-analysis, 100 µL, 1 × 10⁶ cells, top point 1 µg/test, 2-fold,
12 points, one flag) MEASURES MET at all twelve such positions. This does not
generalise to every possible series: the sticky block can only be as short as
the declaration line and the flag text it carries, and a series whose flags
alone exceed roughly 650px of text at this viewport (several vendor-recommendation
and pipetting-minimum flags together, observed at four flags in testing) would
not measure MET here. That limit is a property of how much text a given
series' flags require, not a defect in this mechanism, and is disclosed on
the register row rather than left for a reader to find by constructing a
worse case than acceptance 25's reference one.

---

C4-NF-03 requires the inputs and the full series to fit one screen without
scrolling, at twelve points, with the full input set. Open item 7 asks for this
to be measured before build, and says: *"If it does not fit, the point cap is
reduced; no declaration is dropped."*

## Method

The built artefact, served locally and driven under Playwright. Content height
measured as `getBoundingClientRect().bottom + scrollY` for the last input panel
and for the series panel, the worst of the two taken, and compared against
`innerHeight`.

The reference viewport of open item 11 is still undeclared, so both viewports
the build brief names as the fallback were measured: **1366 x 768** and
**1280 x 800**. C1's acceptance 20 has been observed to fail at both.

## Result 1: the point cap is not the binding constraint

Measured before any change, at 1366 x 768:

| Points | Input column bottom | Series panel bottom | Available |
|---|---|---|---|
| 12 | 2017px | 1965px | 768px |
| 8 | 2017px | 1798px | 768px |
| 6 | 2017px | 1715px | 768px |
| 4 | 2017px | 1631px | 768px |
| 2 | **2017px** | 1477px | 768px |

**The input column is 2017px at two points exactly as at twelve.** It is made of
twelve fields and their declarations, not of the series, so the number of points
does not enter into it.

This is the finding that matters, because the remedy open item 7 prescribes is
to reduce the point cap, and reducing the point cap cannot close a gap that the
point cap does not open. At two points the tool would still fail C4-NF-03 by
1249px, having lost ten points of series to buy nothing.

The other remedy, dropping a declaration, the URS forbids, and rightly: the
declarations are the tool.

## What was changed

**Each declaration panel collapses to a summary of its declared values once the
series exists.** Nothing is hidden: a collapsed panel shows its answers, not a
tick, so every declaration stays on screen and readable, and any panel reopens
on a click. The panels are still ordered so that a user cannot reach a
computation without having passed every declaration, because collapsing happens
only after a panel is complete and only once there is a result to collapse in
favour of.

| | Before | After |
|---|---|---|
| Input column | 2017px | **672px** |

The binding constraint moved from the inputs to the result.

## Result 2: the residual does not close

Measured after the change. Two states are reported, because the worst case for a
result is not the clean one: C4-FL-03 names every point below the declared
minimum, and its message grows with the number of points it names.

**1366 x 768, 768px available**

| Points | Clean | Every point flagged |
|---|---|---|
| 12 | 1143px | 1304px |
| 8 | 1012px | 1137px |
| 6 | 947px | 1054px |
| 4 | 881px | 970px |
| 2 | **816px** | 905px |

**1280 x 800, 800px available**

| Points | Clean | Every point flagged |
|---|---|---|
| 12 | 1129px | 1308px |
| 6 | 933px | 1058px |
| 2 | **802px** | 891px |

**At two points, with no flags, the content still exceeds the viewport**: by
48px at 1366 x 768 and by 2px at 1280 x 800. The masthead and the panel chrome
exceed the available height before a single row of the table is drawn.

C4-NF-03 is therefore **unmeetable at either viewport at any point count**, by
any remedy short of removing the masthead or the scope statement.

The requirement is met from about **1320px of viewport height** at twelve points
in the worst case, and about 1150px in the clean case. No laptop display
provides that: a 1440 x 900 panel gives roughly 800px of viewport.

## Recommendation

**Keep the point cap at 12.** Reducing it is the remedy the URS prescribes, and
the measurements show it does not achieve the requirement at any value. It would
cost a user ten points of series and leave C4-NF-03 unmet, which is not a trade
worth making, and certainly not worth making silently.

**Declare the deviation.** A row has been added to the constants and conventions
register with these measurements, stating that C4-NF-03 is not met and why. That
is the precedent C1 set for its own unmet viewport requirement: its register
carries a `viewport-supported` row reading "ACCEPTED DEVIATION, declared rather
than met", on the ground that the register is the page's disclosure surface and
an undeclared shortfall is exactly what it exists to prevent.

`scripts/check-network.mjs` measures this on every run and prints the number, so
it cannot drift unnoticed, and fails the build if the register stops declaring
the deviation. It does not fail on the shortfall itself: failing there would
make the deviation undeclarable rather than make it go away.

## What the owners are asked to decide

1. **Open item 11, the reference viewport.** Everything above is measured
   against a fallback. If the declared viewport is taller than about 1320px the
   requirement is met as written and none of this arises.
2. **Whether open item 7's instruction should be amended.** As written it
   prescribes a remedy that cannot work, and a reader following it would reduce
   the cap, still fail, and have no next step.
3. **Whether C4-NF-03 should be scoped to the result rather than to the whole
   page.** The series at twelve points, with its flags, fits 768px on its own.
   It is the masthead, the declarations and the scope statement together that do
   not, and each of those is required by something else.
