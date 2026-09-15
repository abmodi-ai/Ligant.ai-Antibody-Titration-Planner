/**
 * Section 8: compute and flag.
 *
 * Flags never block the determination. Each appears in both the human-readable
 * and the structured output with a machine-readable reason code, and the code
 * IS the URS identifier. Matching on message text would not be a
 * machine-readable code: the wording is still under revision in places, and a
 * consumer pinned to it would break when the wording changed without the
 * behaviour changing.
 *
 * THE SHAPE IS C1'S, not the Antigen Density Calculator's. C4-OUT-04 requires
 * the structured object to use the same format as C1, and C1's flag carries
 * `code`, `message`, `evaluatedOn` and `kind`. The ADC's shared `Flag` carries
 * `level`, `message` and an optional `remedy` and has no code at all, which is
 * one of the gaps C1 recorded against it. Two additions here, both additive:
 *
 *   `points`  C4-OUT-04 requires point-level scope in addition to the
 *             series-level list, because C4-FL-03 names specific points and a
 *             flat list loses which. This is the field open item 8 turns on.
 *   `remedy`  a flag states what is wrong; the remedy states what to do about
 *             it. Diagnosis with no remedy leaves a user stuck at the moment
 *             they most need help. Carried from the ADC's convention.
 *
 * `level` is deliberately absent. The ADC uses it to decide whether a figure
 * may be reported, which in C4 is decided by whether a form is withheld, and
 * that is a property of the form rather than of the flag beside it.
 */

import { formatSigFigs } from './format'
import {
  IMPORTED_MASS_BASIS_LABEL,
  STOCK_MASS_BASIS_LABEL,
  UNIT_LABEL,
  type ImportedMassBasis,
  type StockMassBasis,
} from './units'

export type FlagCode =
  | 'C4-FL-01'
  | 'C4-FL-02'
  | 'C4-FL-03'
  | 'C4-FL-04'
  | 'C4-FL-05'
  | 'C4-FL-06'
  | 'C4-FL-07'
  | 'C4-FL-08'
  | 'C4-FL-09'
  | 'C4-FL-10'
  | 'C4-FL-11'

export interface Flag {
  code: FlagCode
  /** What the flag states, in the terms section 8 requires it to be stated. */
  message: string
  /** Which declaration or quantity the condition was evaluated on. */
  evaluatedOn: string
  /**
   * Whether the condition compares quantities, reads a declaration, or reads
   * something an imported object brought with it.
   *
   * The first distinction is not cosmetic. A threshold flag is evaluated on the
   * UNROUNDED value, which can differ from the displayed value in its last
   * significant figure, so a flagged point and an unflagged one can render
   * identically. See THRESHOLD_EVALUATION_STATEMENT.
   */
  kind: 'threshold' | 'declaration' | 'import'
  /** C4-OUT-04. The points this flag is about, where it names any. */
  points?: number[]
  /** What the user should do. Omitted only where no action is available. */
  remedy?: string
}

/**
 * Said once on the output, wherever a threshold flag is shown.
 *
 * The case that requires it is C4-FX-10: a point whose stock volume is one ULP
 * below the declared minimum raises C4-FL-03 and displays as 2.00 µL. A point
 * of exactly 2 µL raises nothing and displays as 2.00 µL. Two points, identical
 * on screen, one flagged and one not. Neither is wrong, since section 8
 * evaluates against the computed system and C4-UN-06 governs the rendering, but
 * a user who cannot reconcile the flag with the number in front of them loses
 * confidence in both.
 */
export const THRESHOLD_EVALUATION_STATEMENT =
  'Flags that compare quantities are evaluated on the unrounded value, which may differ from ' +
  'the displayed value in its last significant figure. A flagged point and an unflagged one ' +
  'can therefore display identically.'

/**
 * C4-IV-05. The ratio test's own blind spot, stated on the page in plain
 * terms rather than left in the register for a reader to work out from the
 * sensitivity figures.
 */
export const RATIO_TEST_BLIND_SPOT_STATEMENT =
  'The series arithmetic is checked by an automated test that compares each consecutive ratio ' +
  'against the declared dilution factor. That check has a blind spot: a defect smaller than ' +
  'approximately one rounding per step is invisible to it.'

/* ------------------------------------------------------------------------ */
/* C4-FL-11: the reportable pairs table                                      */
/* ------------------------------------------------------------------------ */

/**
 * URS section 8, "Reportable pairs", transcribed in the order it is written.
 *
 * ROWS ARE EVALUATED IN ORDER AND THE FIRST MATCH SUPPLIES THE REASON. That is
 * editorial correction 1 of v0.4 and it is load-bearing rather than tidy: a
 * monomer weight against an unrecorded stock basis matches both the third row
 * and the fourth, and the reasons differ. The order decides which the user is
 * told, and the monomer reason is the more specific of the two.
 *
 * Form 6 is reported in the first two rows and withheld in every other. It
 * withholds rather than warns because dividing a whole-reagent mass by a
 * subunit weight gives a molar concentration of subunits, off by the factor of
 * two or four that the declaration exists to catch, and the tool cannot tell a
 * VHH from one chain of an IgG: molecular-weight identification is out of
 * scope, so it cannot distinguish the case where the monomer IS the whole
 * reagent from the case where it is a part of it.
 */
interface ReportablePair {
  importedBasis: ImportedMassBasis | 'any'
  stockBasis: StockMassBasis | 'any'
  reported: boolean
  reason: string | null
}

export const REPORTABLE_PAIRS: readonly ReportablePair[] = [
  { importedBasis: 'assembled', stockBasis: 'antibody-protein', reported: true, reason: null },
  { importedBasis: 'conjugate', stockBasis: 'conjugate', reported: true, reason: null },
  {
    importedBasis: 'monomer',
    stockBasis: 'any',
    reported: false,
    reason:
      'The molecular weight is declared as a monomer or single chain. The molar form would be of that unit, not of the whole reagent, unless the reagent is itself a single chain, which the tool cannot determine.',
  },
  {
    importedBasis: 'any',
    stockBasis: 'not-recorded',
    reported: false,
    reason: 'Stock mass basis not recorded.',
  },
  {
    importedBasis: 'not-recorded',
    stockBasis: 'any',
    reported: false,
    reason: 'Molecular-weight mass basis not recorded.',
  },
  {
    importedBasis: 'assembled',
    stockBasis: 'conjugate',
    reported: false,
    reason: 'Bases differ: whole-molecule weight against conjugate mass.',
  },
  {
    importedBasis: 'conjugate',
    stockBasis: 'antibody-protein',
    reported: false,
    reason: 'Bases differ: conjugate weight against protein mass.',
  },
] as const

export interface PairVerdict {
  reported: boolean
  reason: string | null
}

/** The first matching row of the table above. */
export function reportablePair(
  importedBasis: ImportedMassBasis,
  stockBasis: StockMassBasis,
): PairVerdict {
  for (const row of REPORTABLE_PAIRS) {
    const importedMatches = row.importedBasis === 'any' || row.importedBasis === importedBasis
    const stockMatches = row.stockBasis === 'any' || row.stockBasis === stockBasis
    if (importedMatches && stockMatches) return { reported: row.reported, reason: row.reason }
  }
  // Unreachable while the table's last two rows cover the remaining pairs, and
  // a withholding default rather than a throw, because the failure mode of a
  // table that has lost a row must not be to report a molar concentration
  // nobody checked.
  return {
    reported: false,
    reason: 'The two declared mass bases do not form a pair this tool is able to report.',
  }
}

/* ------------------------------------------------------------------------ */
/* Flag constructors                                                         */
/* ------------------------------------------------------------------------ */

export function flagVolumeMismatch(stainingVolumeUl: number, vendorTestVolumeUl: number): Flag {
  const factor = stainingVolumeUl / vendorTestVolumeUl
  return {
    code: 'C4-FL-01',
    kind: 'threshold',
    evaluatedOn: 'the declared staining volume against the vendor recommendation',
    message:
      `The vendor recommendation was defined at a different volume, ${formatSigFigs(vendorTestVolumeUl)} µL against ` +
      `a staining volume of ${formatSigFigs(stainingVolumeUl)} µL. The per-test volume does not transfer, and the ` +
      `concentration at this staining volume differs by a factor of ${formatSigFigs(factor)}.`,
    remedy:
      'Pipetting the recommended volume into this staining volume does not reproduce the concentration the vendor recommended. Use the concentration column rather than the volume column when carrying this recommendation across.',
  }
}

export function flagTestVolumeNotStated(): Flag {
  return {
    code: 'C4-FL-02',
    kind: 'declaration',
    evaluatedOn: 'the vendor recommendation declaration',
    message:
      'The vendor’s intended concentration cannot be determined; the recommendation cannot be transferred to any other staining volume. The series below is fully defined at the declared volume.',
    remedy:
      'An amount per test with no test volume states neither a concentration nor an amount per cell. If the datasheet gives a test volume elsewhere, enter it; otherwise treat the recommendation as applying only to the vendor’s own assay.',
  }
}

/**
 * C4-FL-03, the one flag that names points.
 *
 * Each named point carries its dilution factor from stock under C4-UN-08, so
 * that an intermediate working stock can be prepared by hand. That preparation
 * is C3's job and C3 does not exist yet, which is open item 10: recorded so the
 * cost is visible rather than discovered at the bench.
 */
export function flagBelowPipettingMinimum(
  points: readonly { index: number; volumeUl: number; dilutionFromStock: number | null }[],
  minimumUl: number,
  provenance: 'entered' | 'default',
): Flag {
  const named = points
    .map((p) => {
      const dilution =
        p.dilutionFromStock === null
          ? 'dilution from stock not computable'
          : `1 in ${formatSigFigs(p.dilutionFromStock)} from stock`
      return `point ${p.index} at ${formatSigFigs(p.volumeUl)} µL (${dilution})`
    })
    .join(', ')

  const minimumSource =
    provenance === 'default'
      ? `the suggested minimum of ${formatSigFigs(minimumUl)} µL, which has not been changed`
      : `the declared minimum of ${formatSigFigs(minimumUl)} µL`

  return {
    code: 'C4-FL-03',
    kind: 'threshold',
    evaluatedOn: 'each point’s computed stock volume against the declared pipetting minimum',
    points: points.map((p) => p.index),
    message:
      `These points cannot be pipetted directly from stock at this staining volume and against ` +
      `${minimumSource}: ${named}.`,
    remedy:
      'Prepare an intermediate working stock and pipette these points from it. Each point is listed with its dilution factor from stock so the intermediate can be designed against it.',
  }
}

export function flagSourceNotRecorded(): Flag {
  return {
    code: 'C4-FL-04',
    kind: 'declaration',
    evaluatedOn: 'the stock concentration provenance declaration',
    message:
      'Stock concentration provenance not recorded; the series cannot be traced to a source and should not be carried into a method record without one.',
    remedy:
      'Record where the concentration came from: the certificate of analysis, the vendor datasheet, or your own measurement.',
  }
}

export function flagConcentrationNotStated(): Flag {
  return {
    code: 'C4-FL-05',
    kind: 'declaration',
    evaluatedOn: 'the stock declaration',
    message:
      'Mass-based forms are not computable; the series is expressed in forms 1 and 4, plus the vendor multiple where a basis is stated.',
    remedy:
      'A concentration from the certificate of analysis, or an A280 measurement, would make the mass-based forms available. Without one the series is still fully defined as volumes and dilutions.',
  }
}

export function flagNoCells(): Flag {
  return {
    code: 'C4-FL-06',
    kind: 'threshold',
    evaluatedOn: 'the cell number',
    message: 'No cells declared; this series describes a no-cell condition.',
    remedy:
      'This is a legitimate control condition and is not an error. Mass per 10⁶ cells is reported as not computable, because there are no cells to express a mass per.',
  }
}

export function flagCellNumberMismatch(declaredCells: number, vendorCells: number): Flag {
  return {
    code: 'C4-FL-07',
    kind: 'threshold',
    evaluatedOn: 'the declared cell number against the vendor recommendation',
    message:
      `The vendor recommendation was defined at a different cell number, ${formatSigFigs(vendorCells)} against ` +
      `${formatSigFigs(declaredCells)} declared here. Antibody depletion may differ, and the recommendation may not ` +
      'transfer at this cell number even at the same concentration.',
    remedy:
      'Whether this matters depends on whether antibody is in excess, which depends on antigen density and affinity. This tool records the difference; it cannot quantify the depletion.',
  }
}

export function flagTopBelowRecommendation(
  topUgPerMl: number,
  recommendedUgPerMl: number,
): Flag {
  return {
    code: 'C4-FL-08',
    kind: 'threshold',
    evaluatedOn: 'the series against the vendor recommendation',
    message:
      `The series begins below the vendor recommendation, at ${formatSigFigs(topUgPerMl)} µg/mL against a ` +
      `recommended ${formatSigFigs(recommendedUgPerMl)} µg/mL; the recommended point is not bracketed by this series.`,
    remedy:
      'Raise the top point to at or above the recommendation if you intend the series to span it. A vendor recommendation is a concentration chosen for a stated assay; it is not established to be a saturating one.',
  }
}

export function flagImportedConjugateBasis(): Flag {
  return {
    code: 'C4-FL-09',
    kind: 'import',
    evaluatedOn: 'the imported mass-basis declaration',
    message:
      'The molecular weight includes label or payload; the molar form shown is of the conjugate, not of the underlying antibody. The tool does not correct for degree of labelling.',
    remedy:
      'Where the molar concentration of the antibody itself is wanted rather than of the conjugate, a protein-basis molecular weight is needed. This tool does not convert between the two.',
  }
}

/** C4-FL-10. Each imported flag is restated in full, not summarised. */
export function flagImportedCarriesFlags(
  imported: readonly { code: string; message: string }[],
): Flag {
  return {
    code: 'C4-FL-10',
    kind: 'import',
    evaluatedOn: 'the imported result object',
    message:
      'The imported value carries flags, restated here in full: ' +
      imported.map((f) => `${f.code}: ${f.message}`).join(' '),
    remedy:
      'These qualify the molecular weight this series’ molar form rests on. They travelled with the value deliberately: a flag that stops at a tool boundary stops doing its work.',
  }
}

export function flagMassBasisPair(
  importedBasis: ImportedMassBasis,
  stockBasis: StockMassBasis,
  reason: string,
): Flag {
  return {
    code: 'C4-FL-11',
    kind: 'declaration',
    evaluatedOn: 'the stock mass basis against the imported molecular-weight mass basis',
    message:
      `Form 6, the molar concentration, is withheld. ${reason} The stock mass is declared as ` +
      `${STOCK_MASS_BASIS_LABEL[stockBasis]}; the molecular weight is declared as ` +
      `${IMPORTED_MASS_BASIS_LABEL[importedBasis]}.`,
    remedy:
      'The tool withholds rather than converting, because correcting between mass bases would need the degree of labelling or the chain composition, and it has neither. Import a molecular weight on a basis matching the stock, or record the basis that is missing.',
  }
}

/* ------------------------------------------------------------------------ */
/* Section 9: failure classes this tool cannot detect                        */
/* ------------------------------------------------------------------------ */

/**
 * C4-FC-01. Required on the tool's own page, visible to the user, not confined
 * to documentation.
 *
 * Exported as data rather than written as prose in a component, so the page
 * cannot drift from the specification by being edited in a template. Fourteen
 * items, in the order section 9 lists them; acceptance 22 counts them.
 */
export const UNDETECTABLE_FAILURES: readonly string[] = [
  'A stock concentration that is *wrong*: mislabelled, degraded, or from a different lot.',
  '*Loss of antibody activity* through storage, freeze-thaw, or age. A correct concentration of an inactive antibody titrates as if it were active.',
  'A titration performed on a *different cell type, fixation state, or permeabilisation condition* than the experiment it will be applied to.',
  '*Absence of Fc receptor blocking*, which changes apparent staining independently of concentration.',
  '*Which binding regime applies.* Concentration (form 3) transfers where antibody is in excess; mass per cell (form 5) transfers where antibody is depleted by the antigen sink. Which governs depends on antigen density, affinity and cell number. The cell density is recorded and a mismatch with the vendor is flagged; neither quantifies depletion.',
  'Whether the series *brackets the optimum*. A flag is raised only where a vendor recommendation with a stated basis was entered, and it states only that the recommended point is not bracketed by this series.',
  'Any error in the *preparation* of the series. The tool states the target; it does not observe what was pipetted.',
  'A *degree of labelling* differing from the lot the recommendation was derived from. A flag records that a payload is included but cannot quantify it.',
  'A staining volume entered as the *volume before antibody addition* rather than the final volume. The term is defined on this page, but the tool cannot verify which the user measured.',
  '*Matrix transfer.* A series titrated on one matrix, whether cells, capture beads, or fixed against live cells, does not establish the optimum on another; surface densities differ by orders of magnitude.',
  '*Volume accommodation.* Whether the stock volume at the top point can be accommodated alongside the volumes the cells and other reagents arrive in. The rejection above bounds only the stock volume against the whole staining volume.',
  '*Dilution convention.* A vendor dilution recommendation read under the other convention differs from the reading used here by (f + 1)/f. The tool cannot detect which the vendor meant.',
  '*Mass-basis mismatch where a basis is unrecorded.* The molar form is withheld when the two mass bases differ or are unrecorded; it cannot tell whether an unrecorded basis would have matched.',
  '*Saturation.* The tool cannot determine whether any point in the series saturates the target. A vendor recommendation does not establish saturation: it is a concentration chosen for a stated assay, frequently for separation, and the datasheet does not say which.',
] as const

/* ------------------------------------------------------------------------ */
/* Section 11: constants and conventions register                            */
/* ------------------------------------------------------------------------ */

export interface RegisterEntry {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly basis: 'derived' | 'inspection' | 'convention'
  readonly status: string
}

/**
 * C4-CN-01. Every threshold at which the tool changes behaviour, and every
 * convention under which a value is interpreted, with its value and its basis.
 * Thresholds chosen by inspection are stated as such. Required on the tool's
 * own address, not only in a manuscript.
 *
 * The page renders this array. Nothing maintains a second copy, so the register
 * cannot describe a threshold the tool does not apply, nor omit one it does.
 */
export const PRECISION_PRINCIPLE =
  'Displayed precision matches the resolution of the physical act the number drives.'

export const CONSTANTS_REGISTER: readonly RegisterEntry[] = [
  {
    id: 'pipetting-minimum',
    label: 'Minimum reliable pipetting volume',
    value: 'User-declared; 2 µL pre-filled as a suggestion',
    basis: 'inspection',
    status:
      'Disclosed default, and ON THE BEHAVIOUR PATH WHENEVER IT IS UNCHANGED. C4-FL-03 is evaluated against whichever value is in the field, so leaving the suggestion in place is a decision and not an abstention. Whether the minimum was entered or left at the default is recorded on the output, in the structured object and in every handoff. No single value has a basis: the minimum a pipette delivers reliably is instrument- and operator-dependent, so none is imposed.',
  },
  {
    id: 'maximum-points',
    label: 'Maximum point count',
    value: '12',
    basis: 'inspection',
    status:
      'Disclosed. Chosen by inspection, as a round number comfortably above what a bench titration series actually runs, not derived from any arithmetic or layout constraint. Open item 7 is withdrawn at v0.5 and no longer the basis for this figure; see C4-NF-03 as restated, which this row does not depend on.',
  },
  {
    id: 'displayed-precision',
    label: 'Displayed precision',
    value: '3 significant figures',
    basis: 'inspection',
    status: `Resolved for this tool under the principle recorded for C1 onward: ${PRECISION_PRINCIPLE} This tool drives a pipette, and three significant figures is the resolution at which a displayed volume corresponds to something a pipette delivers.`,
  },
  {
    id: 'rounding-mode',
    label: 'Rounding mode at displayed precision',
    value: 'Half away from zero, applied to the exact stored binary value',
    basis: 'convention',
    status:
      'Convention, scoped to C1 onward. NOT YET ADOPTED IN C1, which rounds half to even. VERIFIED BY READING C1’s OWN SOURCE, not assumed from a platform primitive: `roundHalfEven`, `Ligant.ai-Molarity-Converter` v0.1.0, src/lib/format.ts lines 75-97, computes the exact decimal expansion of the stored double and rounds it deliberately, on the stated grounds that this is the IEEE 754 default and the default in Python, R and Julia. Its own header comment explicitly REJECTS `toPrecision` for the opposite reason C4 does: both tools independently concluded a platform primitive cannot be trusted to report which value was really a tie. CONFIRMED BY RUNNING IT, not only by reading it: C1 v0.1.0’s own `formatSigFigs` and `isExactTie`, imported and executed unmodified, find genuine binary ties in its own numeric range at its own six-figure precision, for example 0.1015625; every one checked resolves to the even trailing digit, 0.101562 rather than 0.101563, which is round half to even exactly as the source states. Because the code is deliberate, its adoption of half away from zero at C1 v0.6 (open item 13(iii)) resolves to the BEHAVIOUR-CHANGE branch: an engine-version bump and a re-check of every C1 reference table for ties, not a wording change. The divergence is disclosed here rather than left for a reader to discover by comparing two tools. It is applied to the exact stored value rather than to a decimal rendering: a 2-fold series from a round top point lands on genuine binary ties, and a value that merely prints like a tie is usually not one. THE ADC ROW IS REWORDED, NOT MEASURED AS CONFORMING: the prior CONFORMS claim reasoned from the ECMAScript spec for `toFixed`/`Math.round`/`toPrecision` without ever running the ADC’s own code, which is exactly the distinction this project asks of everyone else. Run since: `Ligant.ai-Antigen-Density-Calculator` v0.1.3’s own `formatNumber`, imported and executed unmodified, against the dyadic values that sit exactly on its own tie points (0.125, 0.375, 0.625, 0.875, 12.25). Every one resolves away from zero (0.13, 0.38, 0.63, 0.88, 12.3), so the ADC’s tie-breaking direction is now actually measured and does agree with C4’s convention. But its DISPLAYED PRECISION is not 3 significant figures for most of what it reports: `formatNumber` uses 2 decimal places from 0.01 to 10 and 1 decimal place from 10 to 100, reaching 3 significant figures only below 0.01, via `toPrecision`, which is not exercised by the values above. CONFORMANCE AT C4’s DISPLAYED PRECISION was therefore never a coherent claim for most of the ADC’s own range; what is now measured, and stated as such, is agreement on which way a tie resolves, not on what precision it is resolved to. Recorded in docs/open-item-16-adc-conformance.md.',
  },
  {
    id: 'dilution-factor',
    label: 'Dilution factor',
    value: 'Final volume divided by stock volume',
    basis: 'convention',
    status:
      'Convention, scoped to C1 onward, and stated on the output. A dilution of 1 in 100 is a factor of 100, one part in one hundred total, not one part plus one hundred parts. A vendor recommendation written under the other convention differs by (f + 1)/f and the tool cannot detect which was meant.',
  },
  {
    id: 'staining-volume',
    label: 'Staining volume',
    value: 'The final volume of the stain, including the antibody',
    basis: 'convention',
    status:
      'Convention, scoped to C1 onward, and stated on the output. Whether 100 µL means the volume the antibody is added to or the volume after it is added changes the top-point concentration by the volume fraction of the antibody. Final volume is chosen because it is the quantity that determines concentration. The tool cannot verify which the user measured.',
  },
  {
    id: 'cell-density',
    label: 'Cell density',
    value: 'Computed and stated; no threshold applied',
    basis: 'convention',
    status:
      'Recorded as a declaration of the condition the series was designed under. NO BOUND IS APPLIED to it, deliberately: depletion depends on antigen density, affinity and cell number together, none of which this tool knows, so no single defensible bound exists. Recording the density without a threshold preserves the declaration and carries no uncharacterised constant.',
  },
  {
    id: 'round-trip-tolerance',
    label: 'Round-trip tolerance',
    value: 'Analytic bound: 1 ULP, compared with less than or equal',
    basis: 'derived',
    status:
      'OPEN, URS open item 6, pending NADIRA’s review of the derivation record: the figure is the developer’s and the decision is not, and a register row is not a review. The bound is a REQUIREMENT ON HOW THE CONVERSION IS STRUCTURED, not an observation: the round trip is two operations against one folded constant, because the unit factors are folded at entry, and each operation contributes at most half an ULP. Applied stepwise it would be six operations, and C1 measured that path reaching 3.0 ULP and exceeding a 1 ULP bound in 0.54% of cases. Empirical distribution, reported as evidence the bound is not loose and never as the tolerance itself: worst observed error 1.0 ULP over 200,000 cases across eleven decades of concentration, zero exceedances. Recorded in docs/open-item-06-derived-tolerances.md.',
  },
  {
    id: 'unit-normalisation-tolerance',
    label: 'Unit-normalisation tolerance (C4-IV-04)',
    value: 'Analytic bound: 2 ULP, compared with less than or equal',
    basis: 'derived',
    status:
      'OPEN, URS open item 6. Its own row and its own derivation, separate from the round-trip figure above: that bound is derived over the round trip ALONE, taking the folded constant as given, while this one is derived over the CONVERSION that produces it, which the round trip does not exercise. A quantity entered in the base unit (µL, µg/mL) carries no conversion rounding, since multiplying by 1 is exact; a quantity entered in mL or mg/mL carries one conversion multiply, at most half an ULP. Comparing a base-unit path against a non-base-unit path sums rather than cancels: <=0.5 ULP against <=1.5 ULP is a bound of 2 ULP on their difference. Empirical distribution, reported as evidence: worst observed 1 ULP over 50,000 swept cases at the worst-case unit pairing, zero exceedances. Recorded in docs/open-item-06-derived-tolerances.md.',
  },
  {
    id: 'ratio-test-tolerance',
    label: 'Ratio-test tolerance',
    value: 'Analytic bound: 6 ULP, compared with less than or equal',
    basis: 'derived',
    status:
      'OPEN, URS open item 6, on the same terms as the row above. Derived over the stated generation method and no other, and it does not inherit the round-trip figure. THE BUILD’S EARLIER 4 ULP FIGURE WAS A SAMPLE MAXIMUM OVER 3.3 MILLION CASES AND IS WITHDRAWN AS A TOLERANCE, per C4-CN-01 as amended: an empirical maximum is evidence, never the bound itself. The analytic bound counts every rounding operation in the worst consecutive pair of a 12-point series (exponents 10 and 11): 9 rounding multiplies from exponentiation by squaring, plus 3 divisions (one to form each of the two points, one to form their ratio) = 12 operations x 0.5 ULP = 6 ULP. The 3.3 million-case empirical distribution is kept as evidence the bound is not loose: worst observed 4 ULP, with only 9 cases reaching it and none above. Recorded in docs/open-item-06-derived-tolerances.md.',
  },
  {
    id: 'ratio-test-sensitivity',
    label: 'Ratio-test sensitivity',
    value: 'Detected at 15 significant figures, NOT detected at 16',
    basis: 'derived',
    status:
      'MEASURED, per C4-IV-05, PENDING THE ITEM 6 RECORD; signed with it rather than separately. Stated on the page as the test’s own blind spot, per C4-IV-05: a defect smaller than approximately one rounding per step is invisible to it. An inserted rounding to 16 significant figures moves the series by about 3 ULP, inside the 6 ULP bound; at 15 it reaches about 35 ULP, an order of magnitude clear of it. Recorded in docs/open-item-06-derived-tolerances.md.',
  },
  {
    id: 'nf-03-conformance',
    label: 'C4-NF-03 conformance',
    value: 'MET at the reference viewport, under window scroll, at every acceptance-25 position where a row is in view',
    basis: 'derived',
    status:
      'MEASURED. A prior MEASURED claim on this row was wrong and is withdrawn: it scrolled `.series-scroll`, the series table’s own internal region, and never tested the page itself, so it could not have caught the failure it claimed to rule out. Scrolling the window past roughly 600px showed every row and the C4-FL-03 flag with no declaration visible anywhere, because the declaration summaries lived in the left column and the series and flags lived in the right column, two independently-scrolling regions. The remedy is `.series-sticky` in App.tsx: the declaration line and the flag list sit above the table in one block, `position: sticky` scoped to the table they describe, so they stay in the viewport for as long as any row of it does, under ordinary window scroll and nothing else. Measured by scripts/check-network.mjs, in a real browser, driving actual window scroll, at all fourteen of acceptance 25’s positions (the page at its own top, at its own bottom, and each of twelve rows aligned to the viewport’s bottom edge), on every run. SCOPE: this holds for acceptance 25’s reference declaration set. The sticky block can only be as short as the declaration line and the flag text it carries; a series whose flags alone name enough points to exceed 650 px of text would not measure MET at this viewport, a case acceptance 25’s reference series does not reach. Full measurement recorded in docs/open-item-07-layout-check.md.',
  },
  {
    id: 'reference-viewport',
    label: 'Reference viewport',
    value: '1366 × 650 CSS px',
    basis: 'inspection',
    status:
      'DISCLOSED, URS open item 11, CLOSED at v0.5. Page area delivered by a 1366 × 768 laptop display after browser chrome. Declared as a viewport, not a resolution. Basis configuration: PENDING. The developer’s own measurement environment does not expose real OS window chrome reliably (an automated browser reports no outer window dimensions and an atypical device pixel ratio), so the browser, version, operating system and bookmarks-bar state behind the 650 px figure have not been independently re-measured here and are recorded as pending confirmation on a representative machine, so that the number remains reproducible rather than asserted.',
  },
] as const

/* ------------------------------------------------------------------------ */
/* Statements the output is required to carry                                */
/* ------------------------------------------------------------------------ */

/** C4-OUT-06. */
export const SCOPE_STATEMENT = 'Research use only. Not qualified for GxP decision-making.'

/** C4-OUT-08. */
export const DETERMINES_NOT_VERIFIES_STATEMENT =
  'This tool determines the target concentration at each point. It does not verify what was prepared, and it does not observe what was pipetted.'

/** C4-OUT-10. */
export const STAINING_VOLUME_STATEMENT =
  'Staining volume is taken as the final volume of the stain, including the antibody and every other reagent added. All concentrations are computed on that basis.'

/** C4-OUT-11. */
export const DILUTION_CONVENTION_STATEMENT =
  'Dilution factor is final volume divided by stock volume. A dilution of 1 in 100 is a factor of 100.'

/** C4-AB-07, shown where the vendor basis leaves the concentration undetermined. */
export const VENDOR_UNTRANSFERABLE_STATEMENT =
  'The vendor’s intended concentration cannot be determined from an amount per test with no test volume, so the recommendation cannot be transferred to any other staining volume. The series computed at the declared staining volume remains fully expressed in every form.'

/** The unit a label needs, kept beside the flags that quote units in prose. */
export { UNIT_LABEL }
