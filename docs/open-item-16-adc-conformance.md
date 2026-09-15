# Open item 16: the shipped ADC's conformance to the C1-onward conventions

| Field | Value |
|---|---|
| URS | C4 v0.4, section 11, open item 16, R15 |
| Status | **Tie-breaking direction measured and conforms; displayed precision does not match C4's for most of the ADC's range (see below). "Dilution factor" and "staining volume" not used, no conflict** |
| Owner | Developer |
| Date | 14 September 2026, revised 15 September 2026 |
| Precedes | Preprint submission |

Open item 16 asks for three things to be measured rather than assumed, since
R15 re-scoped the conventions from "tool-set" to "C1 onward" and made ADC
conformance a measurement:

1. the shipped ADC's displayed rounding on an exact binary tie;
2. whether it uses the term "dilution factor" and, if so, under which
   definition;
3. whether it uses the term "staining volume" and, if so, under which
   definition.

Measured against `abmodi-ai/Ligant.ai-Antigen-Density-Calculator` at v0.1.3, the
currently shipped version.

## Revision, 15 September 2026

Nadira's review found this section overclaimed: it was headed CONFORMS and its
own register row said MEASURED, but the table below was produced by
**transcribing** `formatNumber` from the ADC's source into this document and
reasoning about ECMAScript's `toFixed`/`Math.round`/`toPrecision` semantics,
not by running the ADC's own code. That is the exact distinction this project
asks everyone else to observe, applied here for the first time to this row.

Every value in the table below has now been re-run by importing and executing
`Ligant.ai-Antigen-Density-Calculator`'s own `src/lib/format.ts` at v0.1.3
unmodified, not a transcription of it. All seven outputs are unchanged, so the
transcription was accurate. What changes is the claim: the tie-breaking
**direction** is now genuinely measured and does conform, but a second
question the original section never asked turns out to matter more — see
"Precision, not only direction" below.

## 1. Rounding on an exact binary tie: direction CONFORMS, precision usually does not match C4's

The ADC's `formatNumber` is magnitude-adaptive, with fixed decimal places by
decade and a significant-figure branch below 0.01. Ties were constructed as
dyadic values, so that each is a genuine binary tie rather than a decimal that
merely prints like one.

| Value | ADC output | Half away from zero | Half to even |
|---|---|---|---|
| 0.125 | `0.13` | 0.13 | 0.12 |
| 0.375 | `0.38` | 0.38 | 0.38 |
| 10.25 | `10.3` | 10.3 | 10.2 |
| 10.75 | `10.8` | 10.8 | 10.8 |
| 100.5 | `101` | 101 | 100 |
| 101.5 | `102` | 102 | 102 |
| 9999.5 | `10,000` | 10000 | 10000 |

The three rows where the two rules disagree are 0.125, 10.25 and 100.5, and the
ADC takes the half-away-from-zero answer in every one.

**Mechanism, so the result is not an accident of the examples.** The ADC reaches
its output through `toFixed`, `Math.round` and `toPrecision`. ECMAScript
specifies `toFixed` and `toPrecision` to resolve a tie by picking the larger
candidate, and `Math.round` to round a half toward positive infinity. Every
quantity the ADC reports is positive by construction, so all three coincide with
round half away from zero. The conformance is therefore a property of the
platform primitives it uses rather than of the values it happened to be given.

**Precision, not only direction.** C4-UN-09's convention is stated at 3
significant figures, C4's own displayed precision. The ADC's `formatNumber` is
magnitude-adaptive and does not use 3 significant figures over most of its
range: 2 decimal places from 0.01 to 10, 1 decimal place from 10 to 100, whole
numbers from 100 to 9,999, comma-grouped integers from 10,000, and 3
significant figures only below 0.01, via `toPrecision`. All seven rows above
sit at or above 0.01, so all seven are ties at a precision C4 does not itself
display at: 2 or 1 decimal places or whole numbers, never 3 significant
figures. "The ADC conforms to C4's 3-sig-fig convention"
was consequently never a claim the table above could support, at any
precision above 0.01; what it supports, and what is now actually measured, is
that the ADC's tie-breaking DIRECTION agrees with C4's, independent of how
many figures either tool keeps.

**Mechanism, so the direction result is not an accident of the examples.** The
ADC reaches its output through `toFixed`, `Math.round` and `toPrecision`.
ECMAScript specifies `toFixed` and `toPrecision` to resolve a tie by picking
the larger candidate, and `Math.round` to round a half toward positive
infinity. Every quantity the ADC reports is positive by construction, so all
three coincide with round half away from zero. This mechanism argument is
retained because it explains WHY the measured direction holds generally, not
as a substitute for having measured it.

**Recorded consequence.** The ADC's tie-breaking direction agrees with the
rounding convention C4-UN-09 states, without having been written to; its
displayed precision generally does not match C4's, which is disclosed rather
than folded into "conforms." C1 is the tool that DIVERGES on direction: its
`format.ts` implements half-to-even deliberately, on the ground that it is the
IEEE 754 default and the default in Python, R and Julia, so an independent
reimplementation agrees without being told. C1 is to adopt half away from zero
at its v0.6, under open item 13(iii).

So the register's rounding row should read, and does read in C4: the direction
convention is C1 onward, the ADC's direction already agrees and C1's does not
yet, and the ADC's displayed precision is a separate, disclosed fact rather
than folded into the conformance claim.

## 2. "Dilution factor": NOT USED

The term does not appear in the ADC. The word "dilution" appears twice, in
neither case as a quantity:

- `src/lib/quantify.ts:748`, in a remedy: *"restain at a dilution that brings the
  sample inside the range"*. A bench instruction, carrying no number.
- `src/lib/guidance/synonyms.ts:50`, as a search synonym for the concept of
  dose.

**No conflict with C4-UN-08.** There is nothing to reconcile and nothing to
disclose.

## 3. "Staining volume": NOT USED

The term does not appear in the ADC at all. The tool works from median
fluorescence intensities and certified bead values; no volume enters its
arithmetic.

**No conflict with C4-SC-01.**

## Conclusion

Tie-breaking direction agrees on the shipped ADC, now genuinely measured
rather than reasoned about; displayed precision generally does not match
C4's, and is disclosed as a separate fact rather than absorbed into
"conforms." "Dilution factor" and "staining volume" are both inapplicable,
unchanged from the original finding. The item is closed for the ADC on those
terms; what remains under open item 13 is C1's adoption of the rounding
convention, which is a change to a live tool and is not this item.

## How to repeat this

The tie-breaking-direction measurement is `formatNumber`, imported and
executed unmodified from `Ligant.ai-Antigen-Density-Calculator`'s own
`src/lib/format.ts` at v0.1.3, against the seven dyadic values in the table
above, run with Node's native TypeScript support so the source is not
transpiled or rewritten first. The precision finding is a reading of the same
file's branching by magnitude. The "dilution factor" and "staining volume"
findings are two greps over its source. All four are reproducible from a
clone of that repository in under a minute.
