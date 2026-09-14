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
  'Whether the series *brackets the optimum*. C4-FL-08 fires only where a vendor recommendation with a stated basis was entered, and states only that the recommended point is not bracketed.',
  'Any error in the *preparation* of the series. The tool states the target; it does not observe what was pipetted.',
  'A *degree of labelling* differing from the lot the recommendation was derived from. C4-FL-09 records that a payload is included but cannot quantify it.',
  'A staining volume entered as the *volume before antibody addition* rather than the final volume. The term is defined on this page, but the tool cannot verify which the user measured.',
  '*Matrix transfer.* A series titrated on one matrix, whether cells, capture beads, or fixed against live cells, does not establish the optimum on another; surface densities differ by orders of magnitude.',
  '*Volume accommodation.* Whether the stock volume at the top point can be accommodated alongside the volumes the cells and other reagents arrive in. C4-HI-06 bounds only the stock against the whole.',
  '*Dilution convention.* A vendor dilution recommendation read under the other convention differs from the reading used here by (f + 1)/f. The tool cannot detect which the vendor meant.',
  '*Mass-basis mismatch where a basis is unrecorded.* C4-FL-11 withholds the molar form when bases differ or are unrecorded; it cannot tell whether an unrecorded basis would have matched.',
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
      'Disclosed. Chosen by inspection rather than derived, and bounded by what fits one screen with the full input set: see the layout measurement recorded for open item 7.',
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
      'Convention, scoped to C1 onward. NOT YET ADOPTED IN C1, which rounds half to even and is to adopt this at its v0.6. The divergence is disclosed here rather than left for a reader to discover by comparing two tools. It is applied to the exact stored value rather than to a decimal rendering: a 2-fold series from a round top point lands on genuine binary ties, and a value that merely prints like a tie is usually not one. Conformance of the shipped Antigen Density Calculator is measured rather than assumed.',
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
    value: 'To be derived',
    basis: 'derived',
    status:
      'OPEN, URS open item 6. The analytic bound is 2 ULP for the four-operation round trip unless the implementation folds the unit factors, which this one does; unit normalisation by non-power-of-two factors adds further roundings. To be measured over this tool’s own operation set before ship, as C1’s was.',
  },
  {
    id: 'ratio-test-tolerance',
    label: 'Ratio-test tolerance',
    value: 'To be derived',
    basis: 'derived',
    status:
      'OPEN, URS open item 6. Derived over the stated series-generation method and no other; it does not inherit the round-trip figure. Its sensitivity is bounded on both sides by recording the inserted rounding precision at which the ratio test detects an accumulated error and the coarsest at which it does not.',
  },
  {
    id: 'viewport-supported',
    label: 'Viewport at which C4-NF-03 is met',
    value: 'NOT MET at any point count at 1366x768 or 1280x800. Met from about 1320px of viewport height at 12 points',
    basis: 'inspection',
    status:
      'ACCEPTED DEVIATION, declared rather than met. C4-NF-03 requires the inputs and the full series to fit one screen without scrolling. Measured 14 September 2026 at both viewports named in the build brief, since the reference viewport is undeclared. THE POINT CAP IS NOT THE BINDING CONSTRAINT and reducing it cannot close the gap: at TWO points with no flags the content still reaches 816px against 768 available, and 802px against 800. The remedy URS open item 7 prescribes therefore does not work, and reducing the cap would cost a user ten points of series for nothing. What did work is collapsing each declaration to a summary of its declared values once the series exists, which took the input column from 2017px to 672px and moved the binding constraint from the inputs to the result. The residual is the masthead and the panel chrome, which are fixed costs. Full measurement in docs/open-item-07-layout-check.md.',
  },
  {
    id: 'reference-viewport',
    label: 'Reference viewport',
    value: 'Not declared',
    basis: 'inspection',
    status:
      'OPEN, URS open item 11, owned outside this build. The one-screen requirement is measured against it, so until it is declared the layout measurement of open item 7 is recorded at two common laptop viewports instead, and the point cap is set from the worse of them.',
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
