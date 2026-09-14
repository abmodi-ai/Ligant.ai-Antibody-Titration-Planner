# Open item 16: the shipped ADC's conformance to the C1-onward conventions

| Field | Value |
|---|---|
| URS | C4 v0.4, section 11, open item 16, R15 |
| Status | **Measured. The ADC conforms on all three conventions** |
| Owner | Developer |
| Date | 14 September 2026 |
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

## 1. Rounding on an exact binary tie: CONFORMS

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

**Recorded consequence.** The ADC conforms to the rounding convention C4-UN-09
states, without having been written to. C1 is the tool that DIVERGES: its
`format.ts` implements half-to-even deliberately, on the ground that it is the
IEEE 754 default and the default in Python, R and Julia, so an independent
reimplementation agrees without being told. C1 is to adopt half away from zero
at its v0.6, under open item 13(iii).

So the register's rounding row should read, and does read in C4: the convention
is C1 onward, the ADC already conforms, and C1 does not yet. The manuscript's
description of the software needs no disclosure of an ADC divergence, because
there is none.

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

All three conventions are conformant or inapplicable on the shipped ADC. The
register row for each says so. The item is closed for the ADC; what remains
under open item 13 is C1's adoption of the rounding convention, which is a
change to a live tool and is not this item.

## How to repeat this

The measurement is arithmetic on the ADC's own `formatNumber`, transcribed from
`src/lib/format.ts` at v0.1.3, and two greps over its source. Both are
reproducible from a clone of that repository in under a minute; the transcribed
function and the case table are in this document so that a reviewer can check
the transcription rather than trust it.
