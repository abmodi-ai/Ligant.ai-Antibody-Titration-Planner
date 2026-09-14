import { describe, expect, it } from 'vitest'
import { computeSeries, isRejected, type SeriesResult } from './compute'
import { formatSigFigs, isExactTie, ulpsFromDecimalTie } from './format'
import { valueOf } from './forms'
import type { SeriesInputs } from './normalise'
import type { FormId } from './units'

/**
 * The fixture set, and the property C4-FX-22 requires each one to state.
 *
 * Section 10 warns that fixtures must not share the property that something is
 * always wrong with the input, which is why C4-FX-08 is here as a negative
 * control and is asserted to raise nothing at all.
 *
 * CONSTRUCTED PROPERTY OF THE SET. Most fixtures use a factor of 2 and a round
 * top point, so most computed values are dyadic and several land on exact ties
 * at three significant figures. C4-FX-01 and C4-FX-06 are the non-dyadic,
 * non-2-fold cases that keep the arithmetic and the flag logic from being
 * exercised only on values a binary machine handles exactly.
 */

function run(inputs: SeriesInputs): SeriesResult {
  const outcome = computeSeries(inputs)
  if (isRejected(outcome)) {
    throw new Error(`expected a series, got rejections: ${outcome.rejections.map((r) => r.code).join(', ')}`)
  }
  return outcome
}

/** The displayed value of one form at one point, at three significant figures. */
function shown(result: SeriesResult, point: number, form: FormId): string {
  const value = valueOf(result.points[point - 1].forms[form])
  if (value === null) throw new Error(`point ${point} form ${form} is not computed`)
  return formatSigFigs(value)
}

/* ------------------------------------------------------------------------ */
/* Acceptance 1: the reference case                                          */
/* ------------------------------------------------------------------------ */

/**
 * URS section 16, acceptance 1.
 *
 * ASSUMPTION STATED PER C4-FX-22. The top point is round and the factor is 2,
 * so every computed value is dyadic and exactly representable. Two of the
 * displayed values land on EXACT BINARY TIES at three significant figures and
 * the table is correct only under C4-UN-09's round half away from zero: 0.3125,
 * which appears as point 5's volume and point 6's concentration, and 0.03125,
 * which appears as point 6's mass and mass per 10^6 cells. Under half-to-even
 * those would read 0.312 and 0.0312.
 *
 * The URS assumption statement also names 0.15625. That value is NOT a tie at
 * three significant figures: its dropped digits are 25, so it rounds down under
 * every rule and reaches 0.156 either way. The test below measures which values
 * are ties rather than restating the claim, because a fixture that restated it
 * would be asserting the thing C4-UN-09 exists to settle. No number in the
 * table moves either way.
 */
const REFERENCE: SeriesInputs = {
  stock: {
    kind: 'stated',
    concentration: { value: 0.2, unit: 'mg/mL' },
    massBasis: 'antibody-protein',
  },
  stockSource: 'certificate-of-analysis',
  vendor: { basis: 'none' },
  stainingVolume: { value: 100, unit: 'uL' },
  cellNumber: { value: 1, unit: 'cells-1e6' },
  pipettingMinimum: { value: 2, provenance: 'entered' },
  topPoint: { form: 2, value: 1 },
  dilutionFactor: 2,
  points: 6,
  imported: null,
}

describe('acceptance 1, the reference case', () => {
  const result = run(REFERENCE)

  // Point, µL/test, µg/test, µg/mL, dilution from stock, µg per 10^6 cells.
  const TABLE = [
    [1, '5.00', '1.00', '10.0', '20.0', '1.00'],
    [2, '2.50', '0.500', '5.00', '40.0', '0.500'],
    [3, '1.25', '0.250', '2.50', '80.0', '0.250'],
    [4, '0.625', '0.125', '1.25', '160', '0.125'],
    [5, '0.313', '0.0625', '0.625', '320', '0.0625'],
    [6, '0.156', '0.0313', '0.313', '640', '0.0313'],
  ] as const

  it.each(TABLE)(
    'point %s reads %s µL, %s µg, %s µg/mL, 1 in %s, %s µg per 10^6 cells',
    (point, volume, mass, concentration, dilution, perCells) => {
      const i = point as number
      expect(shown(result, i, 1)).toBe(volume)
      expect(shown(result, i, 2)).toBe(mass)
      expect(shown(result, i, 3)).toBe(concentration)
      expect(shown(result, i, 4)).toBe(dilution)
      expect(shown(result, i, 5)).toBe(perCells)
    },
  )

  it('produces six points in descending order, index 1 first', () => {
    expect(result.points).toHaveLength(6)
    const concentrations = result.points.map((p) => p.concentrationUgPerMl as number)
    expect(concentrations[0]).toBe(10)
    for (let i = 1; i < concentrations.length; i += 1) {
      expect(concentrations[i]).toBeLessThan(concentrations[i - 1])
    }
  })

  it('raises C4-FL-03 on points 3 to 6, and nothing else', () => {
    expect(result.flags.map((f) => f.code)).toEqual(['C4-FL-03'])
    expect(result.flags[0].points).toEqual([3, 4, 5, 6])
  })

  it('does not report form 6, because no molecular weight was imported', () => {
    for (const point of result.points) {
      expect(point.forms[6].state).toBe('not-computable')
    }
  })

  it('names each flagged point with its dilution factor from stock', () => {
    // C4-FL-03's payload exists so an intermediate working stock can be
    // designed against it, which is what C3 will consume.
    const message = result.flags[0].message
    expect(message).toContain('point 3')
    expect(message).toContain('1 in 80.0 from stock')
    expect(message).toContain('1 in 640 from stock')
  })

  it('lands on the two exact binary ties the table depends on', () => {
    // Measured, not assumed. These are the values where half away from zero and
    // half to even disagree, and therefore the whole reason C4-UN-09 is written.
    expect(isExactTie(valueOf(result.points[4].forms[1]) as number)).toBe(true)
    expect(isExactTie(valueOf(result.points[5].forms[2]) as number)).toBe(true)
    expect(isExactTie(valueOf(result.points[5].forms[5]) as number)).toBe(true)
    expect(isExactTie(valueOf(result.points[5].forms[3]) as number)).toBe(true)
    // Named in the URS assumption statement, and not in fact a tie at 3 sf.
    expect(isExactTie(valueOf(result.points[5].forms[1]) as number)).toBe(false)
  })

  it('carries the unrounded value of every reported quantity', () => {
    // C4-UN-07. These are what acceptance 3, the invariance tests and the ratio
    // test are evaluated on; the displayed strings above are not.
    expect(valueOf(result.points[4].forms[1])).toBe(0.3125)
    expect(valueOf(result.points[5].forms[2])).toBe(0.03125)
    expect(valueOf(result.points[0].forms[3])).toBe(10)
  })
})

/* ------------------------------------------------------------------------ */
/* C4-FX-08: the negative control                                            */
/* ------------------------------------------------------------------------ */

/**
 * C4-FX-08, and acceptance 9.
 *
 * ASSUMPTION STATED PER C4-FX-22. Constructed so that every section 8 condition
 * evaluates clean rather than by leaving conditions unreachable: the staining
 * volume EQUALS the vendor's stated test volume so C4-FL-01 evaluates and does
 * not fire, the cell number EQUALS the vendor's so C4-FL-07 evaluates and does
 * not fire, the top point at 10 µL is at or above the 5 µL recommendation so
 * C4-FL-08 evaluates and does not fire, and every point is at or above the
 * declared minimum. Values are dyadic; none lands on a tie at 3 sf.
 *
 * A fixture set in which something is always wrong with the input cannot
 * distinguish a tool that checks from a tool that complains, which is what
 * section 10 means by fixtures sharing a property.
 */
const NEGATIVE_CONTROL: SeriesInputs = {
  stock: {
    kind: 'stated',
    concentration: { value: 50, unit: 'ug/mL' },
    massBasis: 'antibody-protein',
  },
  stockSource: 'certificate-of-analysis',
  vendor: {
    basis: 'per-test-volume-stated',
    amountPerTest: { kind: 'volume', value: { value: 5, unit: 'uL' } },
    testVolume: { value: 100, unit: 'uL' },
    cellNumber: { value: 1, unit: 'cells-1e6' },
  },
  stainingVolume: { value: 100, unit: 'uL' },
  cellNumber: { value: 1, unit: 'cells-1e6' },
  pipettingMinimum: { value: 2, provenance: 'entered' },
  topPoint: { form: 2, value: 0.5 },
  dilutionFactor: 2,
  points: 3,
  imported: null,
}

describe('C4-FX-08, the negative control', () => {
  const result = run(NEGATIVE_CONTROL)

  it('raises no flags at all', () => {
    expect(result.flags).toEqual([])
  })

  it('produces the three points the URS states', () => {
    expect(result.points.map((p) => valueOf(p.forms[1]))).toEqual([10, 5, 2.5])
  })

  it('reports both vendor multiples, which are equal because the volumes are', () => {
    // C4-DT-04. They are distinctly labelled even here, so that a reader
    // comparing two runs sees the same two labels in both.
    const multiple = result.points[0].vendorMultiple
    expect(multiple?.identical).toBe(true)
    expect(multiple?.atVendorTestVolume).toBe(2)
    expect(multiple?.atStainingVolume).toBe(2)
  })
})

/* ------------------------------------------------------------------------ */
/* C4-FX-06: non-round, 3-fold                                               */
/* ------------------------------------------------------------------------ */

/**
 * C4-FX-06, quoted from URS section 10.
 *
 * ASSUMPTION STATED PER C4-FX-22. Deliberately NON-DYADIC and non-2-fold: a
 * stock of 0.37 mg/mL, a staining volume of 85 µL and a factor of 3, so no
 * computed value is exactly representable and none lands on a tie. This is the
 * case that keeps C4-FL-03's point selection from being exercised only on
 * values a binary machine handles exactly.
 */
const NON_ROUND_THREE_FOLD: SeriesInputs = {
  stock: {
    kind: 'stated',
    concentration: { value: 0.37, unit: 'mg/mL' },
    massBasis: 'antibody-protein',
  },
  stockSource: 'certificate-of-analysis',
  vendor: { basis: 'none' },
  stainingVolume: { value: 85, unit: 'uL' },
  cellNumber: { value: 1, unit: 'cells-1e6' },
  pipettingMinimum: { value: 2, provenance: 'entered' },
  topPoint: { form: 2, value: 0.8 },
  dilutionFactor: 3,
  points: 7,
  imported: null,
}

describe('C4-FX-06, a non-round 3-fold series', () => {
  const result = run(NON_ROUND_THREE_FOLD)

  it('puts the top point at 2.16 µL, as the URS states', () => {
    expect(shown(result, 1, 1)).toBe('2.16')
  })

  it('raises C4-FL-03 naming exactly points 2 to 7', () => {
    const flag = result.flags.find((f) => f.code === 'C4-FL-03')
    expect(flag?.points).toEqual([2, 3, 4, 5, 6, 7])
  })

  it('lands on no exact tie, which is what makes it the non-dyadic case', () => {
    for (const point of result.points) {
      for (const form of [1, 2, 3, 4, 5] as const) {
        const value = valueOf(point.forms[form])
        if (value !== null) expect(isExactTie(value)).toBe(false)
      }
    }
  })
})

/* ------------------------------------------------------------------------ */
/* C4-FX-01: a hand calculation, constructed clear of every decimal tie      */
/* ------------------------------------------------------------------------ */

/**
 * C4-FX-01, and acceptance 2.
 *
 * ASSUMPTION STATED PER C4-FX-22. A non-round stock of 0.145 mg/mL and a
 * non-round staining volume of 65 µL. CONSTRUCTED so that no displayed value
 * lies within one ULP of a decimal tie at three significant figures, which is
 * what makes a hand calculation able to settle the displayed value at all: a
 * value nearer than that to a tie is rounded by bits the decimal does not show,
 * and no hand calculation can predict which way. The test below MEASURES that
 * property rather than asserting it in a comment.
 *
 * Hand calculation, with the assumption stated:
 *   stock          0.145 mg/mL  = 145 µg/mL
 *   staining       65 µL        = 0.065 mL
 *   top point      0.7 µg/test  -> 0.7 / 0.065      = 10.769230... µg/mL
 *   top volume     10.769230... x 65 / 145          =  4.8275862... µL
 *   dilution       145 / 10.769230...               = 13.464285... x
 *   point 2        divide the concentration by 2.5
 */
const HAND_CALCULATION: SeriesInputs = {
  stock: {
    kind: 'stated',
    concentration: { value: 0.145, unit: 'mg/mL' },
    massBasis: 'antibody-protein',
  },
  stockSource: 'vendor-datasheet',
  vendor: { basis: 'none' },
  stainingVolume: { value: 65, unit: 'uL' },
  cellNumber: { value: 2, unit: 'cells-1e6' },
  pipettingMinimum: { value: 1, provenance: 'entered' },
  topPoint: { form: 2, value: 0.7 },
  dilutionFactor: 2.5,
  points: 4,
  imported: null,
}

describe('C4-FX-01, a hand calculation clear of every decimal tie', () => {
  const result = run(HAND_CALCULATION)

  it('agrees with the hand calculation at the top point', () => {
    expect(shown(result, 1, 3)).toBe('10.8')
    expect(shown(result, 1, 1)).toBe('4.83')
    expect(shown(result, 1, 2)).toBe('0.700')
    expect(shown(result, 1, 4)).toBe('13.5')
    expect(shown(result, 1, 5)).toBe('0.350')
  })

  it('agrees with the hand calculation at point 2', () => {
    expect(shown(result, 2, 3)).toBe('4.31')
    expect(shown(result, 2, 1)).toBe('1.93')
  })

  it('is constructed clear of every decimal tie, measured rather than claimed', () => {
    // The construction C4-FX-22 requires this fixture to state. One ULP is the
    // threshold below which a hand calculation cannot settle the last digit.
    for (const point of result.points) {
      for (const form of [1, 2, 3, 4, 5] as const) {
        const value = valueOf(point.forms[form])
        if (value === null) continue
        expect(ulpsFromDecimalTie(value)).toBeGreaterThan(1)
      }
    }
  })
})
