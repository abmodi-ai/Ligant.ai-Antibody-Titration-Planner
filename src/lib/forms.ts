/**
 * The six forms of C4-UN-05, computed for one point.
 *
 * Every form is produced from ONE computation per point, per C4-UN-05 and
 * C4-OUT-05: the point's concentration, multiplied by a folded constant from
 * `normalise.ts`. Nothing here converts a unit or re-derives another form from
 * a rounded one.
 *
 * THREE KINDS OF ABSENCE, and they are not interchangeable. A reader who cannot
 * tell them apart cannot tell whether the tool declined to answer, could not
 * answer, or answered zero.
 *
 *   computed        a number, unrounded, with its unit
 *   not-computable  the declarations do not determine it; C4-UN-05 requires
 *                   this be reported as such and NOT as zero, blank, or an
 *                   estimate. Forms 2, 3, 5 and 6 under C4-AB-03; form 5 where
 *                   no cells were declared
 *   withheld        it is determinable and the tool is refusing to report it,
 *                   because the declarations it would rest on do not form a
 *                   reportable pair. Form 6 under C4-FL-11, and only there
 *
 * The interface renders the difference structurally rather than by colour: a
 * withheld form keeps its column and its header, so the reader can see the form
 * was considered, and the reason occupies the position the number would have
 * held.
 */

import { type FormId, FORM_UNIT } from './units'
import type { Normalised } from './normalise'

export type FormValue =
  | { state: 'computed'; value: number; unit: string }
  | { state: 'not-computable'; reason: string }
  | { state: 'withheld'; reason: string }

export type PointForms = Readonly<Record<FormId, FormValue>>

export interface Point {
  /** C4-SR-03. One-based, index 1 being the top point. */
  index: number
  /**
   * The concentration this point's forms were computed from, in µg/mL, or null
   * under C4-AB-03 where the series is volumetric.
   */
  concentrationUgPerMl: number | null
  /** The stock volume per test in µL, which is form 1 and also drives C4-FL-03. */
  volumeUl: number | null
  forms: PointForms
}

const NOT_COMPUTABLE_NO_STOCK =
  'not computable: the vendor states no mass concentration for this stock, so no mass-based form is determined'
const NOT_COMPUTABLE_NO_CELLS =
  'not computable: no cells were declared, so there is no quantity of cells to express a mass per'
const NOT_COMPUTABLE_NO_IMPORT =
  'not computable: no molecular weight has been imported, and this tool accepts none of its own'

/**
 * One point of a series whose stock concentration is stated.
 *
 * `withheldReason` is C4-FL-11's, passed in rather than decided here: the flag
 * rules own the reportable-pairs table, and this file owns the arithmetic.
 * Keeping the two apart is what stops a display rule from quietly becoming a
 * computation rule.
 */
export function formsAtConcentration(
  index: number,
  concentrationUgPerMl: number,
  base: Normalised,
  withheldReason: string | null,
): Point {
  const volumeUl =
    base.volumePerConcentration === null ? null : concentrationUgPerMl * base.volumePerConcentration

  const form6: FormValue =
    withheldReason !== null
      ? { state: 'withheld', reason: withheldReason }
      : base.molarPerConcentration === null
        ? { state: 'not-computable', reason: NOT_COMPUTABLE_NO_IMPORT }
        : {
            state: 'computed',
            value: concentrationUgPerMl * base.molarPerConcentration,
            unit: FORM_UNIT[6],
          }

  return {
    index,
    concentrationUgPerMl,
    volumeUl,
    forms: {
      1:
        volumeUl === null
          ? { state: 'not-computable', reason: NOT_COMPUTABLE_NO_STOCK }
          : { state: 'computed', value: volumeUl, unit: FORM_UNIT[1] },
      2: {
        state: 'computed',
        value: concentrationUgPerMl * base.massPerConcentration,
        unit: FORM_UNIT[2],
      },
      3: { state: 'computed', value: concentrationUgPerMl, unit: FORM_UNIT[3] },
      // C4-UN-08: final volume over stock volume. Computed as the ratio of the
      // two concentrations, which is the same quantity reached without going
      // through a volume, so it does not inherit form 1's rounding.
      4:
        base.stockUgPerMl === null
          ? { state: 'not-computable', reason: NOT_COMPUTABLE_NO_STOCK }
          : {
              state: 'computed',
              value: base.stockUgPerMl / concentrationUgPerMl,
              unit: FORM_UNIT[4],
            },
      5:
        base.massPer1e6CellsPerConcentration === null
          ? { state: 'not-computable', reason: NOT_COMPUTABLE_NO_CELLS }
          : {
              state: 'computed',
              value: concentrationUgPerMl * base.massPer1e6CellsPerConcentration,
              unit: FORM_UNIT[5],
            },
      6: form6,
    },
  }
}

/**
 * One point of a series under C4-AB-03, where the vendor states only a number
 * of tests per vial.
 *
 * Forms 1 and 4 are reported: both are volumetric and neither needs to know
 * what is dissolved in the stock. Forms 2, 3, 5 and 6 are reported as not
 * computable, which C4-UN-05 requires to be distinct from zero, from blank and
 * from an estimate. C4-FL-05 states the consequence once at series level.
 */
export function formsAtVolume(index: number, volumeUl: number, base: Normalised): Point {
  const notComputable: FormValue = { state: 'not-computable', reason: NOT_COMPUTABLE_NO_STOCK }
  return {
    index,
    concentrationUgPerMl: null,
    volumeUl,
    forms: {
      1: { state: 'computed', value: volumeUl, unit: FORM_UNIT[1] },
      2: notComputable,
      3: notComputable,
      4: { state: 'computed', value: base.stainingVolumeUl / volumeUl, unit: FORM_UNIT[4] },
      5: notComputable,
      6: notComputable,
    },
  }
}

/** The value of a form, where it has one. Null for both kinds of absence. */
export function valueOf(form: FormValue): number | null {
  return form.state === 'computed' ? form.value : null
}
