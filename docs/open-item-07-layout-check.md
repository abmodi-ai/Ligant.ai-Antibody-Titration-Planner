# Open item 7: the one-screen requirement, measured

| Field | Value |
|---|---|
| URS | C4 v0.4, C4-NF-03, C4-SR-04, acceptance 25, open item 7 |
| Status | **Measured. The requirement is not met, and the prescribed remedy cannot meet it** |
| Owner | Developer |
| Date | 14 September 2026 |
| Depends on | Open item 11, the reference viewport, still undeclared |

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
