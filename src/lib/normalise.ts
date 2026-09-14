/**
 * The declared inputs, and the single normalisation that turns them into the
 * constants the whole computation runs on.
 *
 * THE RULE, which C4-UN-04 requires and C4-IV-04 measures: every quantity is
 * converted to its base unit exactly once, at entry, and nothing downstream
 * re-normalises. The base units are microlitres, micrograms per millilitre, and
 * cells.
 *
 * WHY ONCE MATTERS. Every conversion factor between these units is a power of
 * ten, and no power of ten above zero is a power of two, so every conversion is
 * a rounding. C1 measured the cost of getting this wrong on its own two-factor
 * conversion: folding the unit factors into a single divisor held its round
 * trip at 1.0 ULP with no exceedances over 500,000 random pairs, while the
 * stepwise path reached 3.0 ULP and exceeded the bound in 0.54% of cases. It is
 * a requirement on how the computation is STRUCTURED, not an observation about
 * it. C4-IV-04 and C4-FX-02 compare the microlitre path against the millilitre
 * path and the mg/mL path against the µg/mL path; an implementation that
 * normalised twice would fail them.
 *
 * WHAT FOLDING LOOKS LIKE HERE. Every form of C4-UN-05 except the dilution
 * factor is the point's concentration multiplied by one constant that depends
 * on nothing but the declarations:
 *
 *     form 1, volume of stock per test  = c_i × (V / c_stock)
 *     form 2, mass per test             = c_i × (V / 1000)
 *     form 3, concentration             = c_i
 *     form 5, mass per 10^6 cells       = c_i × (V / 1000) × (10^6 / N)
 *     form 6, molar concentration       = c_i × (10^-3 / MW)
 *
 * Those four bracketed constants are computed here, once, and are the only
 * bridge between a declaration and a reported number. Form 4 is the one
 * exception and is a ratio of two concentrations, c_stock / c_i.
 */

import {
  CELLS_TO_COUNT,
  CONCENTRATION_TO_UG_PER_ML,
  VOLUME_TO_UL,
  type CellUnit,
  type ConcentrationUnit,
  type FormId,
  type ImportedMassBasis,
  type StockMassBasis,
  type StockSource,
  type VendorBasis,
  type VolumeUnit,
} from './units'

/** A number the user typed, with the unit they selected for it. */
export interface Entered<U extends string> {
  value: number
  unit: U
}

/**
 * C4-AB-01 and C4-AB-03. Either a stated mass concentration, or the declaration
 * that the vendor stated none.
 *
 * A discriminated union rather than a nullable number, because "the vendor
 * states only a number of tests per vial" is an ANSWER and not an absence. It
 * changes which forms are computable, and C4-AB-05 requires it to be
 * distinguishable in the structured object from a field left blank.
 */
export type StockDeclaration =
  | { kind: 'stated'; concentration: Entered<ConcentrationUnit>; massBasis: StockMassBasis }
  | { kind: 'not-stated-by-vendor' }

/**
 * The amount a datasheet states per test.
 *
 * Both forms are ordinary. "5 µL per test" is a volume of the vendor's own
 * stock and means nothing without that stock's concentration; "1 µg per test"
 * is a mass and is independent of it. Supporting only the first would have made
 * a common datasheet unenterable, and supporting only the second would have
 * made the C4-FX-08 negative control unexpressible.
 */
export type VendorAmount =
  | { kind: 'volume'; value: Entered<VolumeUnit> }
  | { kind: 'mass'; ug: number }

/** C4-AB-06, with the conditional fields each basis brings with it. */
export type VendorDeclaration =
  | {
      basis: 'per-test-volume-stated'
      amountPerTest: VendorAmount
      testVolume: Entered<VolumeUnit>
      /** C4-AB-06 option (a), and R17: captured for C4-FL-07. */
      cellNumber: Entered<CellUnit> | 'not-stated'
    }
  | { basis: 'per-test-volume-not-stated'; amountPerTest: VendorAmount }
  | {
      basis: 'final-concentration'
      /** Either a concentration or a dilution factor from stock, per C4-UN-08. */
      concentration: Entered<ConcentrationUnit> | { dilutionFactor: number }
      /** R17: captured for this basis as for the per-test one. */
      cellNumber: Entered<CellUnit> | 'not-stated'
    }
  | { basis: 'none' }

/**
 * The form the top point was entered in, per C4-SR-01.
 *
 * Form 6 is absent. C4 accepts no molecular weight of its own, so a molar top
 * point could only be entered when an import is present and C4-FL-11 is not
 * raised, which would make the accepted input set depend on an import that can
 * be removed after the fact. Forms 1 to 5 are accepted where the declared stock
 * makes them computable; under C4-AB-03 that is forms 1 and 4 alone.
 */
export type TopPointForm = Exclude<FormId, 6>

export type TopPointEntry =
  | { form: 1; value: Entered<VolumeUnit> }
  | { form: 2; value: number }
  | { form: 3; value: Entered<ConcentrationUnit> }
  | { form: 4; value: number }
  | { form: 5; value: number }

/** C4-ST-01. What a C1 result object supplies, and nothing else. */
export interface ImportedMolecularWeight {
  /** In g/mol, as C1 reports it after its own normalisation. */
  gPerMol: number
  /** C1-MW-04, carried verbatim. */
  provenance: string
  /** C1-MW-07, the declaration C4-FL-11 compares against. */
  massBasis: ImportedMassBasis
  /** C4-ST-01: an imported object shall not be accepted stripped of its flags. */
  flags: readonly { code: string; message: string }[]
  /** The engine and schema that produced it, for the derivation. */
  toolVersion: string
}

export interface SeriesInputs {
  stock: StockDeclaration
  /** C4-AB-04. Required whether or not a concentration was stated. */
  stockSource: StockSource
  vendor: VendorDeclaration
  stainingVolume: Entered<VolumeUnit>
  cellNumber: Entered<CellUnit>
  /**
   * C4-SR-05. The declared minimum, and whether the declaration is the user's
   * or the suggestion left untouched. R16 requires the distinction to reach the
   * output, the structured object and every handoff, because the default is on
   * the behaviour path whenever it is unchanged.
   */
  pipettingMinimum: { value: number; provenance: 'entered' | 'default' }
  topPoint: TopPointEntry
  dilutionFactor: number
  points: number
  imported: ImportedMolecularWeight | null
}

/**
 * C4-SR-05. The suggestion, not a constant on the behaviour path when the user
 * replaces it, and on it whenever they do not.
 *
 * No single value has a basis: the minimum a pipette delivers reliably is
 * instrument- and operator-dependent, a P2 in its calibrated range against a
 * P10 at its lower bound against ISO 8655 tolerances at the bottom of a range.
 * So none is imposed. This is what the field is pre-filled with, visibly marked
 * as a suggestion, and it is disclosed in the constants register.
 */
export const SUGGESTED_PIPETTING_MINIMUM_UL = 2

/** C4-SR-04. Inspection-chosen, disclosed in the register, open item 7. */
export const MIN_POINTS = 2
export const MAX_POINTS = 12

/**
 * The declarations reduced to base units and folded into the constants every
 * reported quantity is computed from.
 *
 * Nothing downstream reads a unit or applies a conversion factor. If a value
 * below is wrong, exactly one multiplication produced it.
 */
export interface Normalised {
  /** Micrograms per millilitre, or null under C4-AB-03. */
  stockUgPerMl: number | null
  stainingVolumeUl: number
  cells: number
  pipettingMinimumUl: number

  /**
   * C4-SC-04. Cells per microlitre of staining volume, stated on the output as
   * a declaration of the condition the series was designed under. No threshold
   * is applied to it: depletion depends on antigen density, affinity and cell
   * number together, none of which this tool knows, so there is no defensible
   * single bound and recording the density carries no uncharacterised constant.
   */
  cellsPerUl: number

  /** Microlitres of stock per unit of µg/mL. Null under C4-AB-03. */
  volumePerConcentration: number | null
  /** Micrograms per unit of µg/mL, which is the staining volume in millilitres. */
  massPerConcentration: number
  /** Micrograms per 10^6 cells per unit of µg/mL. Null where no cells were declared. */
  massPer1e6CellsPerConcentration: number | null
  /** Moles per litre per unit of µg/mL. Null where no molecular weight was imported. */
  molarPerConcentration: number | null
}

export function normalise(inputs: SeriesInputs): Normalised {
  const stockUgPerMl =
    inputs.stock.kind === 'stated'
      ? inputs.stock.concentration.value *
        CONCENTRATION_TO_UG_PER_ML[inputs.stock.concentration.unit]
      : null

  const stainingVolumeUl = inputs.stainingVolume.value * VOLUME_TO_UL[inputs.stainingVolume.unit]
  const cells = inputs.cellNumber.value * CELLS_TO_COUNT[inputs.cellNumber.unit]

  // The staining volume in millilitres, which is what turns a concentration in
  // µg/mL into a mass in µg. Written as one division so the µL path and the mL
  // path reach it by the same number of roundings.
  const massPerConcentration = stainingVolumeUl / 1000

  return {
    stockUgPerMl,
    stainingVolumeUl,
    cells,
    pipettingMinimumUl: inputs.pipettingMinimum.value,
    cellsPerUl: cells / stainingVolumeUl,
    volumePerConcentration: stockUgPerMl === null ? null : stainingVolumeUl / stockUgPerMl,
    massPerConcentration,
    // Form 5 is undefined rather than infinite at zero cells: C4-UN-05 reports
    // it as not computable, and C4-FL-06 says why.
    massPer1e6CellsPerConcentration: cells > 0 ? (massPerConcentration * 1e6) / cells : null,
    // µg/mL is mg/L, so the factor to g/L is 10^-3 and molarity is that over
    // the molecular weight in g/mol.
    molarPerConcentration: inputs.imported === null ? null : 1e-3 / inputs.imported.gPerMol,
  }
}

/**
 * The top point, converted to the concentration the series is generated from.
 *
 * C4-DT-03: the computation is anchored on concentration in the staining volume
 * and the volume per test is derived from it, never the reverse. A
 * volume-anchored computation is the spreadsheet pattern that produces the
 * transfer failure this tool exists to prevent: the volume looks the same at
 * any staining volume, so a change of volume is invisible. Anchoring on
 * concentration makes the change visible in the first computed quantity.
 *
 * C4-SR-01: the ENTERED value in its entered form is the persisted input. This
 * conversion runs on every render from that entered value, and its result is
 * displayed as a derived quantity. Nothing stores what it returns.
 */
export function anchorConcentration(inputs: SeriesInputs, base: Normalised): number | null {
  const entry = inputs.topPoint
  switch (entry.form) {
    case 1: {
      if (base.volumePerConcentration === null) return null
      const ul = entry.value.value * VOLUME_TO_UL[entry.value.unit]
      return ul / base.volumePerConcentration
    }
    case 2:
      return entry.value / base.massPerConcentration
    case 3:
      return entry.value.value * CONCENTRATION_TO_UG_PER_ML[entry.value.unit]
    case 4:
      return base.stockUgPerMl === null ? null : base.stockUgPerMl / entry.value
    case 5:
      return base.massPer1e6CellsPerConcentration === null
        ? null
        : entry.value / base.massPer1e6CellsPerConcentration
  }
}

/**
 * The top point as a volume, for the C4-AB-03 case where there is no
 * concentration to anchor on.
 *
 * Where the vendor states only a number of tests per vial, forms 1 and 4 are
 * still fully determined: both are volumetric, and neither needs to know what
 * is dissolved in the stock. The series is then a series of volumes and the
 * anchor is a volume. C4-DT-03's ordering is not violated by this, because
 * there is no concentration for it to be violated against; the mass-based forms
 * are reported as not computable and C4-FL-05 says why.
 */
export function anchorVolumeUl(inputs: SeriesInputs, base: Normalised): number | null {
  const entry = inputs.topPoint
  if (entry.form === 1) return entry.value.value * VOLUME_TO_UL[entry.value.unit]
  // C4-UN-08: the dilution factor is final volume over stock volume, so the
  // stock volume is the staining volume divided by it.
  if (entry.form === 4) return base.stainingVolumeUl / entry.value
  return null
}

/** The forms a top point may be entered in, given what the stock declares. */
export function acceptedTopPointForms(stock: StockDeclaration): readonly TopPointForm[] {
  return stock.kind === 'stated' ? [1, 2, 3, 4, 5] : [1, 4]
}

export type { VendorBasis }
