/**
 * The form's own state, and the translation from it into declarations.
 *
 * Kept out of the component and expressed as data so that the gating rules of
 * acceptance 13 can be tested without a DOM, and so that what is persisted is a
 * flat, inspectable document rather than a React tree.
 *
 * EVERY NUMERIC FIELD IS A STRING here and a number only after parsing. A field
 * the user is midway through typing is not a number, and storing it as one
 * would mean deciding what "0." is before they have finished saying it.
 */

import type {
  Entered,
  ImportedMolecularWeight,
  SeriesInputs,
  TopPointForm,
  VendorDeclaration,
} from './normalise'
import { acceptedTopPointForms, SUGGESTED_PIPETTING_MINIMUM_UL } from './normalise'
import type {
  CellUnit,
  ConcentrationUnit,
  StockMassBasis,
  StockSource,
  VendorBasis,
  VolumeUnit,
} from './units'
import type { RetainableField } from './retention'

export interface FormState {
  stockKind: 'stated' | 'not-stated-by-vendor'
  stockValue: string
  stockUnit: ConcentrationUnit
  stockMassBasis: StockMassBasis | ''
  stockSource: StockSource | ''

  vendorBasis: VendorBasis
  vendorAmountKind: 'volume' | 'mass'
  vendorAmountValue: string
  vendorAmountUnit: VolumeUnit
  vendorTestVolume: string
  vendorTestVolumeUnit: VolumeUnit
  vendorConcentrationKind: 'concentration' | 'dilution'
  vendorConcentrationValue: string
  vendorConcentrationUnit: ConcentrationUnit
  vendorCellsKind: 'stated' | 'not-stated'
  vendorCells: string
  vendorCellsUnit: CellUnit

  stainingVolume: string
  stainingVolumeUnit: VolumeUnit
  cellNumber: string
  cellNumberUnit: CellUnit
  pipettingMinimum: string
  /** C4-SR-05 and R16. False while the pre-filled suggestion stands. */
  pipettingMinimumEntered: boolean

  topForm: TopPointForm
  topValue: string
  topVolumeUnit: VolumeUnit
  topConcentrationUnit: ConcentrationUnit
  dilutionFactor: string
  points: string
}

/**
 * The empty form.
 *
 * C4-AB-02 forbids inferring, defaulting, pre-filling or suggesting a stock
 * concentration, so every declaration starts blank. The ONE pre-filled value is
 * the pipetting minimum, which C4-SR-05 requires to be pre-filled at 2 µL and
 * VISIBLY MARKED AS A SUGGESTION, and whose entered-or-defaulted status travels
 * with every result.
 */
export const EMPTY_FORM: FormState = {
  stockKind: 'stated',
  stockValue: '',
  stockUnit: 'mg/mL',
  stockMassBasis: '',
  stockSource: '',

  vendorBasis: 'none',
  vendorAmountKind: 'volume',
  vendorAmountValue: '',
  vendorAmountUnit: 'uL',
  vendorTestVolume: '',
  vendorTestVolumeUnit: 'uL',
  vendorConcentrationKind: 'concentration',
  vendorConcentrationValue: '',
  vendorConcentrationUnit: 'ug/mL',
  vendorCellsKind: 'not-stated',
  vendorCells: '',
  vendorCellsUnit: 'cells-1e6',

  stainingVolume: '',
  stainingVolumeUnit: 'uL',
  cellNumber: '',
  cellNumberUnit: 'cells-1e6',
  pipettingMinimum: String(SUGGESTED_PIPETTING_MINIMUM_UL),
  pipettingMinimumEntered: false,

  topForm: 3,
  topValue: '',
  topVolumeUnit: 'uL',
  topConcentrationUnit: 'ug/mL',
  dilutionFactor: '',
  points: '',
}

/** A typed number, or null where the field is empty or not yet a number. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim()
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * C4-ST-04. Keeps `topForm` valid for `stockKind`, whichever of the two just
 * changed.
 *
 * Reproduced against the build: enter a stock concentration, enter the top
 * point as a concentration (form 3), then switch the stock to "not stated by
 * vendor". Form 3 needs a stock concentration to resolve to a stock volume,
 * and once the stock is declared not stated there is none. Leaving `topForm`
 * at 3 is the uncontrolled-select trap: the `<select>` no longer renders an
 * option for 3, so it falls back to displaying its first remaining option
 * while the state still holds 3, and the two disagree on screen. Silently
 * switching `topForm` to another accepted value would fix the control but
 * hide the fact that the user's number no longer means what they entered it
 * to mean.
 *
 * So neither happens. The top point is CLEARED and reported as invalidated,
 * the same treatment C4-ST-04 gives any declaration whose premise changed
 * under it, rather than a value the tool relabels on the user's behalf.
 *
 * Called from both the interactive stock-kind change and a restore from
 * storage, so the two paths cannot drift apart and a value written before
 * this rule existed is corrected on load rather than trusted.
 */
export function reconcileTopPoint(form: FormState): { form: FormState; invalidated: boolean } {
  if (acceptedTopPointForms(form.stockKind).includes(form.topForm)) {
    return { form, invalidated: false }
  }
  return { form: { ...form, topForm: 1, topValue: '' }, invalidated: true }
}

/**
 * Acceptance 13: what is still missing before a series can be computed.
 *
 * "No series completes without an explicit stock declaration (concentration and
 * mass basis, or C4-AB-03), staining volume, cell number, and pipetting
 * minimum." The gate is here rather than in the component so that it is the
 * same gate whatever is rendering it.
 *
 * A cell number of ZERO satisfies this. It is a declaration, not an absence: it
 * describes a no-cell control condition, and C4-FL-06 says so on the output.
 * An EMPTY field is what does not satisfy it.
 */
export function missingDeclarations(form: FormState): string[] {
  const missing: string[] = []

  if (form.stockKind === 'stated') {
    if (parseNumber(form.stockValue) === null) missing.push('the stock concentration')
    if (form.stockMassBasis === '') missing.push('what the stated stock mass is the mass of')
  }
  if (form.stockSource === '') missing.push('where the stock concentration came from')
  if (parseNumber(form.stainingVolume) === null) missing.push('the staining volume')
  if (parseNumber(form.cellNumber) === null) missing.push('the cell number')
  if (parseNumber(form.pipettingMinimum) === null) missing.push('the minimum reliable pipetting volume')
  if (parseNumber(form.topValue) === null) missing.push('the top point of the series')
  if (parseNumber(form.dilutionFactor) === null) missing.push('the dilution factor between points')
  if (parseNumber(form.points) === null) missing.push('the number of points')

  if (form.vendorBasis === 'per-test-volume-stated') {
    if (parseNumber(form.vendorAmountValue) === null) missing.push('the amount the vendor recommends per test')
    if (parseNumber(form.vendorTestVolume) === null) missing.push('the test volume the vendor states')
  }
  if (form.vendorBasis === 'per-test-volume-not-stated' && parseNumber(form.vendorAmountValue) === null) {
    missing.push('the amount the vendor recommends per test')
  }
  if (form.vendorBasis === 'final-concentration' && parseNumber(form.vendorConcentrationValue) === null) {
    missing.push('the concentration or dilution the vendor recommends')
  }
  if (
    form.vendorBasis !== 'none' &&
    form.vendorBasis !== 'per-test-volume-not-stated' &&
    form.vendorCellsKind === 'stated' &&
    parseNumber(form.vendorCells) === null
  ) {
    missing.push("the vendor's stated cell number")
  }

  return missing
}

function vendorDeclaration(form: FormState): VendorDeclaration {
  const cells: Entered<CellUnit> | 'not-stated' =
    form.vendorCellsKind === 'stated' && parseNumber(form.vendorCells) !== null
      ? { value: parseNumber(form.vendorCells) as number, unit: form.vendorCellsUnit }
      : 'not-stated'

  const amount =
    form.vendorAmountKind === 'mass'
      ? ({ kind: 'mass', ug: parseNumber(form.vendorAmountValue) ?? 0 } as const)
      : ({
          kind: 'volume',
          value: { value: parseNumber(form.vendorAmountValue) ?? 0, unit: form.vendorAmountUnit },
        } as const)

  switch (form.vendorBasis) {
    case 'per-test-volume-stated':
      return {
        basis: 'per-test-volume-stated',
        amountPerTest: amount,
        testVolume: {
          value: parseNumber(form.vendorTestVolume) ?? 0,
          unit: form.vendorTestVolumeUnit,
        },
        cellNumber: cells,
      }
    case 'per-test-volume-not-stated':
      return { basis: 'per-test-volume-not-stated', amountPerTest: amount }
    case 'final-concentration':
      return {
        basis: 'final-concentration',
        concentration:
          form.vendorConcentrationKind === 'dilution'
            ? { dilutionFactor: parseNumber(form.vendorConcentrationValue) ?? 0 }
            : {
                value: parseNumber(form.vendorConcentrationValue) ?? 0,
                unit: form.vendorConcentrationUnit,
              },
        cellNumber: cells,
      }
    default:
      return { basis: 'none' }
  }
}

/** The top point, in the form it was entered in. C4-SR-01. */
function topPoint(form: FormState): SeriesInputs['topPoint'] {
  const value = parseNumber(form.topValue) ?? 0
  switch (form.topForm) {
    case 1:
      return { form: 1, value: { value, unit: form.topVolumeUnit } }
    case 3:
      return { form: 3, value: { value, unit: form.topConcentrationUnit } }
    default:
      return { form: form.topForm, value }
  }
}

/** The declarations, or null where the form is not yet complete. */
export function toSeriesInputs(
  form: FormState,
  imported: ImportedMolecularWeight | null,
  retainedFields: readonly RetainableField[] = [],
): SeriesInputs | null {
  if (missingDeclarations(form).length > 0) return null

  return {
    stock:
      form.stockKind === 'stated'
        ? {
            kind: 'stated',
            concentration: { value: parseNumber(form.stockValue) as number, unit: form.stockUnit },
            massBasis: form.stockMassBasis as StockMassBasis,
          }
        : { kind: 'not-stated-by-vendor' },
    stockSource: form.stockSource as StockSource,
    vendor: vendorDeclaration(form),
    stainingVolume: {
      value: parseNumber(form.stainingVolume) as number,
      unit: form.stainingVolumeUnit,
    },
    cellNumber: { value: parseNumber(form.cellNumber) as number, unit: form.cellNumberUnit },
    pipettingMinimum: {
      value: parseNumber(form.pipettingMinimum) as number,
      provenance: form.pipettingMinimumEntered ? 'entered' : 'default',
    },
    topPoint: topPoint(form),
    dilutionFactor: parseNumber(form.dilutionFactor) as number,
    points: parseNumber(form.points) as number,
    imported,
    retainedFields,
  }
}

/** Whether the form holds anything worth persisting. Storage mirrors work. */
export function hasContent(form: FormState): boolean {
  return (
    parseNumber(form.stockValue) !== null ||
    parseNumber(form.stainingVolume) !== null ||
    parseNumber(form.cellNumber) !== null ||
    parseNumber(form.topValue) !== null ||
    form.stockSource !== '' ||
    form.stockMassBasis !== ''
  )
}

/**
 * Which of the four declaration panels have been answered in full.
 *
 * Exported so the layout remedy of C4-NF-03 can collapse a completed panel
 * without the completeness rule living inside a component, and so that the
 * rule is the same one `missingDeclarations` applies. A panel is complete only
 * when every declaration it carries has an answer; "no vendor recommendation
 * used" is an answer, and an empty field is not.
 */
export interface PanelCompletion {
  stock: boolean
  vendor: boolean
  context: boolean
  design: boolean
}

export function panelCompletion(form: FormState): PanelCompletion {
  const stockStated =
    form.stockKind === 'not-stated-by-vendor' ||
    (parseNumber(form.stockValue) !== null && form.stockMassBasis !== '')

  const vendorCellsAnswered =
    form.vendorCellsKind === 'not-stated' || parseNumber(form.vendorCells) !== null

  let vendor = true
  if (form.vendorBasis === 'per-test-volume-stated') {
    vendor =
      parseNumber(form.vendorAmountValue) !== null &&
      parseNumber(form.vendorTestVolume) !== null &&
      vendorCellsAnswered
  } else if (form.vendorBasis === 'per-test-volume-not-stated') {
    vendor = parseNumber(form.vendorAmountValue) !== null
  } else if (form.vendorBasis === 'final-concentration') {
    vendor = parseNumber(form.vendorConcentrationValue) !== null && vendorCellsAnswered
  }

  return {
    stock: stockStated && form.stockSource !== '',
    vendor,
    context:
      parseNumber(form.stainingVolume) !== null &&
      parseNumber(form.cellNumber) !== null &&
      parseNumber(form.pipettingMinimum) !== null,
    design:
      parseNumber(form.topValue) !== null &&
      parseNumber(form.dilutionFactor) !== null &&
      parseNumber(form.points) !== null,
  }
}
