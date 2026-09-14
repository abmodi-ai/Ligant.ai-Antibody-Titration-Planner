/**
 * Units, and the declarations that travel with a titration series.
 *
 * Every numeric input carries an explicitly selected unit (C4-UN-01) and no
 * unit is ever inferred from magnitude. Volume, concentration and cell-number
 * units are selected independently (C4-UN-02), which is why they are three
 * separate types rather than one union with a runtime check.
 *
 * The base units are microlitres, micrograms per millilitre, and cells. The
 * multiplier tables below are the ONLY place in this tool where a magnitude
 * relationship between two units is written down. Nothing else may derive one.
 */

/** C4-UN-03, volume. */
export type VolumeUnit = 'uL' | 'mL'

/** C4-UN-03, mass concentration. */
export type ConcentrationUnit = 'mg/mL' | 'ug/mL' | 'ng/mL'

/** C4-SC-02. Cell number, which is a count and not a concentration. */
export type CellUnit = 'cells' | 'cells-1e6'

/** Mass, as forms 2 and 5 report it. Not an input unit. */
export type MassUnit = 'ug'

export const VOLUME_UNITS: readonly VolumeUnit[] = ['uL', 'mL']
export const CONCENTRATION_UNITS: readonly ConcentrationUnit[] = ['mg/mL', 'ug/mL', 'ng/mL']
export const CELL_UNITS: readonly CellUnit[] = ['cells', 'cells-1e6']

/**
 * Multipliers to the base units.
 *
 * Every factor here other than 1 is a power of ten, and no power of ten above
 * zero is a power of two, so every conversion is a rounding. That is why
 * `normalise.ts` applies exactly one of these per quantity, once, at entry.
 */
export const VOLUME_TO_UL: Readonly<Record<VolumeUnit, number>> = {
  uL: 1,
  mL: 1000,
}

export const CONCENTRATION_TO_UG_PER_ML: Readonly<Record<ConcentrationUnit, number>> = {
  'mg/mL': 1000,
  'ug/mL': 1,
  'ng/mL': 1e-3,
}

export const CELLS_TO_COUNT: Readonly<Record<CellUnit, number>> = {
  cells: 1,
  'cells-1e6': 1e6,
}

/** How a unit is written for a reader. ASCII identifiers, real symbols on screen. */
export const UNIT_LABEL: Readonly<Record<VolumeUnit | ConcentrationUnit | CellUnit | MassUnit, string>> = {
  uL: 'µL',
  mL: 'mL',
  'mg/mL': 'mg/mL',
  'ug/mL': 'µg/mL',
  'ng/mL': 'ng/mL',
  cells: 'cells',
  'cells-1e6': 'cells × 10⁶',
  ug: 'µg',
}

/**
 * C4-AB-04. Where the stock concentration came from.
 *
 * "not recorded" is an accepted answer (C4-AB-05) and is a value, not an
 * absence. It must be distinguishable in the structured object from a field
 * left blank, which is why this type has no `undefined` member and the form
 * carries a separate unanswered state.
 */
export type StockSource =
  | 'certificate-of-analysis'
  | 'vendor-datasheet'
  | 'measured'
  | 'not-recorded'

export const STOCK_SOURCES: readonly StockSource[] = [
  'certificate-of-analysis',
  'vendor-datasheet',
  'measured',
  'not-recorded',
]

export const STOCK_SOURCE_LABEL: Readonly<Record<StockSource, string>> = {
  'certificate-of-analysis': 'certificate of analysis',
  'vendor-datasheet': 'vendor datasheet',
  measured: 'measured (A280 or equivalent)',
  'not-recorded': 'not recorded',
}

/**
 * C4-AB-09. What the stated stock mass is the mass of.
 *
 * The C1-MW-07 option set, minus one option. C1 offers "a subunit of the
 * molecule as it exists in solution" because a molecular weight can be quoted
 * for one chain. A stock CONCENTRATION is stated as protein mass regardless of
 * chain format, so the assembled/monomer distinction does not arise on this
 * side of the comparison; the molecular weight carries it. C4-FL-11 is where
 * the two declarations meet.
 */
export type StockMassBasis = 'antibody-protein' | 'conjugate' | 'not-recorded'

export const STOCK_MASS_BASES: readonly StockMassBasis[] = [
  'antibody-protein',
  'conjugate',
  'not-recorded',
]

export const STOCK_MASS_BASIS_LABEL: Readonly<Record<StockMassBasis, string>> = {
  'antibody-protein':
    'the antibody protein, unconjugated mass; select this where the datasheet quotes protein or IgG concentration, whatever the reagent’s format',
  conjugate: 'a conjugate, including its label or payload',
  'not-recorded': 'not recorded',
}

/**
 * C1-MW-07, as an imported C1 object declares it.
 *
 * Mirrored here rather than imported, because C4 has no dependency on C1's
 * source: an object arrives as data over the C4-ST-06 transport, and this is
 * the vocabulary that object speaks. `assembled` has no counterpart in
 * `StockMassBasis` by design, which is exactly what makes the C4-FL-11 table
 * non-trivial.
 */
export type ImportedMassBasis = 'assembled' | 'monomer' | 'conjugate' | 'not-recorded'

export const IMPORTED_MASS_BASIS_LABEL: Readonly<Record<ImportedMassBasis, string>> = {
  assembled: 'the assembled molecule as it exists in solution',
  monomer: 'a monomer or single chain',
  conjugate: 'a conjugate, including its label or payload',
  'not-recorded': 'not recorded',
}

/**
 * C4-AB-06. The basis of a vendor recommendation, which decides whether the
 * recommendation transfers to any other staining volume.
 *
 * A "test" is vendor-defined. Most datasheets mean 1 × 10^6 cells in 100 µL,
 * but that is a convention rather than a standard, and some give an amount per
 * test without the volume. The number on the datasheet looks identical in every
 * case, which is why this is a compelled declaration rather than an inference.
 */
export type VendorBasis =
  | 'per-test-volume-stated'
  | 'per-test-volume-not-stated'
  | 'final-concentration'
  | 'none'

export const VENDOR_BASES: readonly VendorBasis[] = [
  'per-test-volume-stated',
  'per-test-volume-not-stated',
  'final-concentration',
  'none',
]

export const VENDOR_BASIS_LABEL: Readonly<Record<VendorBasis, string>> = {
  'per-test-volume-stated': 'per test, with the test volume stated by the vendor',
  'per-test-volume-not-stated': 'per test, test volume not stated by the vendor',
  'final-concentration':
    'as a final concentration (µg/mL, or a dilution factor from stock under the C4-UN-08 convention)',
  none: 'no vendor recommendation used',
}

/**
 * The six forms of C4-UN-05, in the order the specification lists them.
 *
 * The identifiers are the form numbers because every requirement, flag and
 * fixture in the URS refers to them that way. A name would read better in code
 * and would need translating at every boundary with the document.
 */
export type FormId = 1 | 2 | 3 | 4 | 5 | 6

export const FORMS: readonly FormId[] = [1, 2, 3, 4, 5, 6]

export const FORM_LABEL: Readonly<Record<FormId, string>> = {
  1: 'volume of stock per test',
  2: 'mass per test',
  3: 'final mass concentration in the staining volume',
  4: 'dilution factor relative to stock',
  5: 'mass per 10⁶ cells',
  6: 'molar concentration in the staining volume',
}

/** The unit each form is reported in. Form 4 is a ratio and carries none. */
export const FORM_UNIT: Readonly<Record<FormId, string>> = {
  1: 'uL',
  2: 'ug',
  3: 'ug/mL',
  4: 'x',
  5: 'ug/1e6-cells',
  6: 'M',
}
