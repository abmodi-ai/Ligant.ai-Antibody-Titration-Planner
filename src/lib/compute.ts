/**
 * The determination: one entry point, one computation.
 *
 * C4-OUT-05 requires the structured and human-readable outputs to be generated
 * from one computation and to be incapable of disagreeing. This file is that
 * computation. `serialise.ts` projects what it returns and performs no
 * arithmetic; the components render what it returns and perform none either.
 *
 * THE PIPELINE, in the order URS section 5 and section 6 require:
 *
 *   normalise   every quantity to base units, exactly once          C4-UN-04
 *   reject      the declarations that describe nothing real          section 7
 *   anchor      the top point, in its entered form, to a
 *               concentration at the declared staining volume        C4-DT-03
 *   generate    the series, from the top point and integer index     C4-IV-06
 *   reject      the computed system, for C4-HI-06                    section 7
 *   forms       every form of C4-UN-05 that is computable            C4-DT-01
 *   flag        against the computed system                          section 8
 *
 * Rounding appears nowhere in this file. It is applied at display, and only
 * there, so that no threshold is evaluated against a rounded value and no
 * reported quantity inherits a rounding it did not need. C4-UN-07 requires the
 * unrounded value of every reported quantity to be in the structured object,
 * and it is what acceptance 3, the invariance tests and the ratio test are all
 * evaluated on.
 */

import {
  anchorConcentration,
  anchorVolumeUl,
  normalise,
  type Normalised,
  type SeriesInputs,
  type VendorDeclaration,
} from './normalise'
import { GENERATION_METHOD, seriesValue } from './generate'
import { formsAtConcentration, formsAtVolume, valueOf, type Point } from './forms'
import { rejectInputs, rejectSeries, type Rejection } from './validate'
import {
  DETERMINES_NOT_VERIFIES_STATEMENT,
  DILUTION_CONVENTION_STATEMENT,
  SCOPE_STATEMENT,
  STAINING_VOLUME_STATEMENT,
  THRESHOLD_EVALUATION_STATEMENT,
  flagBelowPipettingMinimum,
  flagCellNumberMismatch,
  flagConcentrationNotStated,
  flagImportedCarriesFlags,
  flagImportedConjugateBasis,
  flagMassBasisPair,
  flagNoCells,
  flagSourceNotRecorded,
  flagTestVolumeNotStated,
  flagTopBelowRecommendation,
  flagVolumeMismatch,
  reportablePair,
  type Flag,
} from './flags'
import { PRECISION_STATEMENT } from './format'
import { APP_VERSION } from './site'
import { CELLS_TO_COUNT, CONCENTRATION_TO_UG_PER_ML, VOLUME_TO_UL } from './units'

/**
 * C4-DT-04. Each point as a multiple of the vendor recommendation.
 *
 * Two multiples, distinctly labelled, because they are different questions and
 * they differ whenever the volumes do. `atVendorTestVolume` asks what fraction
 * of the vendor's own recommended CONCENTRATION this point is. `atStainingVolume`
 * asks what fraction of the concentration you would reach by pipetting the
 * vendor's stated amount into YOUR tube. A lab that titrates in 100 µL and
 * stains in 50 µL has doubled the second while leaving the first alone, and
 * reporting only one of them is how that goes unseen.
 */
export interface VendorMultiple {
  atVendorTestVolume: number
  atStainingVolume: number
  /** True where the two volumes agree, so the two multiples are one number. */
  identical: boolean
}

export interface SeriesPoint extends Point {
  vendorMultiple: VendorMultiple | null
}

export interface VendorContext {
  basis: VendorDeclaration['basis']
  /** The recommended concentration at the vendor's own test volume, in µg/mL. */
  recommendedUgPerMl: number | null
  /** The same recommended amount, in the user's staining volume, in µg/mL. */
  atStainingVolumeUgPerMl: number | null
  vendorTestVolumeUl: number | null
  vendorCells: number | null
}

export interface SeriesResult {
  ok: true
  inputs: SeriesInputs
  normalised: Normalised
  /**
   * What the series was generated from. A concentration in the ordinary case,
   * per C4-DT-03; a volume under C4-AB-03, where there is no concentration for
   * it to be anchored on.
   */
  anchor: { kind: 'concentration'; ugPerMl: number } | { kind: 'volume'; ul: number }
  points: SeriesPoint[]
  vendor: VendorContext | null
  flags: Flag[]
  /** C4-FL-11. Null where form 6 is not withheld. */
  form6WithheldReason: string | null
  engineVersion: string
  generationMethod: string
  /** C4-DT-02 and C4-OUT-01. The relations applied, shown with the result. */
  relations: string[]
  /** C4-OUT-01. */
  assumptions: string[]
}

export type Outcome = SeriesResult | { ok: false; rejections: Rejection[] }

/** Narrowing helper, so a caller cannot read a series off a rejected input. */
export function isRejected(outcome: Outcome): outcome is { ok: false; rejections: Rejection[] } {
  return outcome.ok === false
}

/** The vendor's recommendation, reduced to a concentration where it has one. */
function vendorContext(inputs: SeriesInputs, base: Normalised): VendorContext | null {
  const v = inputs.vendor
  if (v.basis === 'none') return null

  const cells = (declared: { value: number; unit: keyof typeof CELLS_TO_COUNT } | 'not-stated') =>
    declared === 'not-stated' ? null : declared.value * CELLS_TO_COUNT[declared.unit]

  // An amount per test becomes a concentration only once a volume is named.
  // A mass needs no stock concentration to do so; a volume of the vendor's own
  // stock needs one, and has none under C4-AB-03.
  const amountToUgPerMl = (
    amount: { kind: 'volume'; value: { value: number; unit: keyof typeof VOLUME_TO_UL } } | { kind: 'mass'; ug: number },
    volumeUl: number,
  ): number | null => {
    if (amount.kind === 'mass') return (amount.ug * 1000) / volumeUl
    if (base.stockUgPerMl === null) return null
    const ul = amount.value.value * VOLUME_TO_UL[amount.value.unit]
    return (ul * base.stockUgPerMl) / volumeUl
  }

  if (v.basis === 'per-test-volume-not-stated') {
    return {
      basis: v.basis,
      recommendedUgPerMl: null,
      atStainingVolumeUgPerMl: null,
      vendorTestVolumeUl: null,
      vendorCells: null,
    }
  }

  if (v.basis === 'per-test-volume-stated') {
    const testVolumeUl = v.testVolume.value * VOLUME_TO_UL[v.testVolume.unit]
    return {
      basis: v.basis,
      recommendedUgPerMl: amountToUgPerMl(v.amountPerTest, testVolumeUl),
      atStainingVolumeUgPerMl: amountToUgPerMl(v.amountPerTest, base.stainingVolumeUl),
      vendorTestVolumeUl: testVolumeUl,
      vendorCells: cells(v.cellNumber),
    }
  }

  // A final concentration is already a concentration and does not depend on a
  // volume, so both multiples are the same number and the labels collapse.
  const stated =
    'dilutionFactor' in v.concentration
      ? base.stockUgPerMl === null
        ? null
        : base.stockUgPerMl / v.concentration.dilutionFactor
      : v.concentration.value * CONCENTRATION_TO_UG_PER_ML[v.concentration.unit]

  return {
    basis: v.basis,
    recommendedUgPerMl: stated,
    atStainingVolumeUgPerMl: stated,
    vendorTestVolumeUl: null,
    vendorCells: cells(v.cellNumber),
  }
}

export function computeSeries(inputs: SeriesInputs): Outcome {
  const inputRejections = rejectInputs(inputs)
  if (inputRejections.length > 0) return { ok: false, rejections: inputRejections }

  const base = normalise(inputs)

  // C4-FL-11 is decided before the forms are built, because it decides whether
  // form 6 exists at all. The flag rules own the table; forms.ts owns the
  // arithmetic, and neither reaches into the other.
  const pair =
    inputs.imported !== null && inputs.stock.kind === 'stated'
      ? reportablePair(inputs.imported.massBasis, inputs.stock.massBasis)
      : null
  const form6WithheldReason = pair !== null && !pair.reported ? pair.reason : null

  const usesConcentration = inputs.stock.kind === 'stated'
  const anchorC = usesConcentration ? anchorConcentration(inputs, base) : null
  const anchorV = usesConcentration ? null : anchorVolumeUl(inputs, base)

  // Both branches below share C4-HI-01: the top point fails to resolve to a
  // positive quantity before a series exists to evaluate, one anchored on
  // concentration and the other on volume. C4-HI-06 is a different condition,
  // evaluated against the COMPUTED SYSTEM by rejectSeries below, once a series
  // exists to evaluate it against; see validate.ts. The volume branch was
  // previously tagged C4-HI-06, which conflated the two.
  if (usesConcentration && (anchorC === null || !(anchorC > 0))) {
    return {
      ok: false,
      rejections: [
        {
          code: 'C4-HI-01',
          field: 'top-point',
          message:
            'The top point does not resolve to a concentration greater than zero at the declared staining volume. A series has to start somewhere, and every point below the top is smaller still.',
        },
      ],
    }
  }
  if (!usesConcentration && (anchorV === null || !(anchorV > 0))) {
    return {
      ok: false,
      rejections: [
        {
          code: 'C4-HI-01',
          field: 'top-point',
          message:
            'The top point does not resolve to a stock volume greater than zero. Where the vendor states no concentration, the top point has to be entered as a volume per test or as a dilution factor from stock.',
        },
      ],
    }
  }

  const anchor = usesConcentration
    ? ({ kind: 'concentration', ugPerMl: anchorC as number } as const)
    : ({ kind: 'volume', ul: anchorV as number } as const)

  const rawPoints: Point[] = Array.from({ length: inputs.points }, (_, i) => {
    const index = i + 1
    if (anchor.kind === 'concentration') {
      return formsAtConcentration(
        index,
        seriesValue(anchor.ugPerMl, inputs.dilutionFactor, index),
        base,
        form6WithheldReason,
      )
    }
    return formsAtVolume(index, seriesValue(anchor.ul, inputs.dilutionFactor, index), base)
  })

  const seriesRejections = rejectSeries(
    rawPoints.map((p) => p.concentrationUgPerMl),
    rawPoints.map((p) => p.volumeUl),
    base.stockUgPerMl,
    base.stainingVolumeUl,
  )
  if (seriesRejections.length > 0) return { ok: false, rejections: seriesRejections }

  const vendor = vendorContext(inputs, base)

  const points: SeriesPoint[] = rawPoints.map((p) => ({
    ...p,
    vendorMultiple:
      vendor !== null &&
      vendor.recommendedUgPerMl !== null &&
      vendor.atStainingVolumeUgPerMl !== null &&
      p.concentrationUgPerMl !== null
        ? {
            atVendorTestVolume: p.concentrationUgPerMl / vendor.recommendedUgPerMl,
            atStainingVolume: p.concentrationUgPerMl / vendor.atStainingVolumeUgPerMl,
            identical: vendor.recommendedUgPerMl === vendor.atStainingVolumeUgPerMl,
          }
        : null,
  }))

  return {
    ok: true,
    inputs,
    normalised: base,
    anchor,
    points,
    vendor,
    flags: raiseFlags(inputs, base, points, vendor, pair),
    form6WithheldReason,
    engineVersion: APP_VERSION,
    generationMethod: GENERATION_METHOD,
    relations: relationsApplied(inputs, base),
    assumptions: [
      STAINING_VOLUME_STATEMENT,
      DILUTION_CONVENTION_STATEMENT,
      PRECISION_STATEMENT,
      DETERMINES_NOT_VERIFIES_STATEMENT,
      THRESHOLD_EVALUATION_STATEMENT,
      SCOPE_STATEMENT,
    ],
  }
}

/**
 * Every section 8 condition, evaluated against the computed system.
 *
 * Order is source order and is deliberate: what is wrong with the series comes
 * before what is wrong with its provenance, and what an import brought with it
 * comes last, because it qualifies one form rather than the whole series.
 */
function raiseFlags(
  inputs: SeriesInputs,
  base: Normalised,
  points: readonly SeriesPoint[],
  vendor: VendorContext | null,
  pair: { reported: boolean; reason: string | null } | null,
): Flag[] {
  const flags: Flag[] = []

  // C4-FL-01. Only where the vendor stated a volume for there to be a
  // difference from.
  if (
    vendor !== null &&
    vendor.vendorTestVolumeUl !== null &&
    vendor.vendorTestVolumeUl !== base.stainingVolumeUl
  ) {
    flags.push(flagVolumeMismatch(base.stainingVolumeUl, vendor.vendorTestVolumeUl))
  }

  // C4-FL-02.
  if (inputs.vendor.basis === 'per-test-volume-not-stated') flags.push(flagTestVolumeNotStated())

  // C4-FL-03. The only point-scoped flag, and the reason C4-OUT-04 requires
  // point-level scope of whatever format carries this object.
  const below = points
    .filter((p) => p.volumeUl !== null && p.volumeUl < base.pipettingMinimumUl)
    .map((p) => ({
      index: p.index,
      volumeUl: p.volumeUl as number,
      dilutionFromStock: valueOf(p.forms[4]),
    }))
  if (below.length > 0) {
    flags.push(
      flagBelowPipettingMinimum(below, base.pipettingMinimumUl, inputs.pipettingMinimum.provenance),
    )
  }

  // C4-FL-04.
  if (inputs.stockSource === 'not-recorded') flags.push(flagSourceNotRecorded())

  // C4-FL-05.
  if (inputs.stock.kind === 'not-stated-by-vendor') flags.push(flagConcentrationNotStated())

  // C4-FL-06. Zero cells is legal and is not rejected defensively.
  if (base.cells === 0) flags.push(flagNoCells())

  // C4-FL-07. Only where the vendor stated a cell number to disagree with.
  if (vendor !== null && vendor.vendorCells !== null && vendor.vendorCells !== base.cells) {
    flags.push(flagCellNumberMismatch(base.cells, vendor.vendorCells))
  }

  // C4-FL-08. Only where a recommendation with a STATED BASIS was entered, so
  // "test volume not stated" does not reach here: it has no concentration to
  // compare against, and C4-FL-02 has already said so.
  const top = points[0]?.concentrationUgPerMl ?? null
  if (vendor !== null && vendor.recommendedUgPerMl !== null && top !== null) {
    if (top < vendor.recommendedUgPerMl) {
      flags.push(flagTopBelowRecommendation(top, vendor.recommendedUgPerMl))
    }
  }

  // C4-FL-09. Raised on the imported declaration whether or not the pair is
  // reportable: it describes what the weight IS, which is true either way.
  if (inputs.imported !== null && inputs.imported.massBasis === 'conjugate') {
    flags.push(flagImportedConjugateBasis())
  }

  // C4-FL-10. C4-ST-01 forbids an imported object being accepted stripped of
  // its flags, and this is what stops them stopping at the boundary.
  if (inputs.imported !== null && inputs.imported.flags.length > 0) {
    flags.push(flagImportedCarriesFlags(inputs.imported.flags))
  }

  // C4-FL-11.
  if (pair !== null && !pair.reported && inputs.imported !== null && inputs.stock.kind === 'stated') {
    flags.push(
      flagMassBasisPair(
        inputs.imported.massBasis,
        inputs.stock.massBasis,
        pair.reason ?? 'The two declared mass bases do not form a reportable pair.',
      ),
    )
  }

  return flags
}

/** C4-DT-02. The relations applied, in the terms the derivation states them. */
function relationsApplied(inputs: SeriesInputs, base: Normalised): string[] {
  const relations = [
    'Series: concentration at point i = concentration at the top point / f^(i-1), with f the declared dilution factor.',
  ]
  if (inputs.stock.kind === 'stated') {
    relations.push(
      'Volume of stock per test = concentration at the point x staining volume / stock concentration.',
      'Mass per test = concentration at the point x staining volume.',
      'Dilution factor from stock = stock concentration / concentration at the point.',
    )
    if (base.cells > 0) {
      relations.push('Mass per 10⁶ cells = mass per test x 10⁶ / cell number.')
    }
    if (base.molarPerConcentration !== null) {
      relations.push(
        'Molar concentration = mass concentration / molecular weight, with the molecular weight taken from the imported result object.',
      )
    }
  } else {
    relations.push(
      'Volume of stock per test = volume at the top point / f^(i-1).',
      'Dilution factor from stock = staining volume / volume of stock per test.',
    )
  }
  relations.push(
    'Cell density = cell number / staining volume, recorded as a declaration and not compared against any threshold.',
  )
  return relations
}
