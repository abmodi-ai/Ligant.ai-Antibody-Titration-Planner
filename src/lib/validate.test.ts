import { describe, expect, it } from 'vitest'
import { computeSeries } from './compute'
import type { SeriesInputs } from './normalise'
import { CONSTANTS_REGISTER } from './flags'

/**
 * Section 7 and acceptance 10: every condition is rejected, with a message
 * naming the quantity AND the physical reason.
 *
 * The second half of that is the part worth testing, and the part a generic
 * validator fails. Section 7 says so in terms: "Generic validation errors do
 * not satisfy this section." So each test below asserts not only that the
 * rejection fired but that its message says what is wrong with the world rather
 * than what is wrong with the form.
 */

const VALID: SeriesInputs = {
  stock: { kind: 'stated', concentration: { value: 0.2, unit: 'mg/mL' }, massBasis: 'antibody-protein' },
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

function rejectionsFor(patch: Partial<SeriesInputs>) {
  const outcome = computeSeries({ ...VALID, ...patch })
  if (outcome.ok) return []
  return outcome.rejections
}

describe('the valid case is not rejected', () => {
  it('produces a series', () => {
    // The control for this file. A section 7 suite that only ever fed invalid
    // inputs could not tell a tool that checks from a tool that refuses.
    expect(computeSeries(VALID).ok).toBe(true)
  })
})

describe('C4-HI-01, a stock concentration that is zero or negative', () => {
  it.each([0, -5] as const)('rejects %s mg/mL', (value) => {
    const [rejection] = rejectionsFor({
      stock: { kind: 'stated', concentration: { value, unit: 'mg/mL' }, massBasis: 'antibody-protein' },
    })
    expect(rejection.code).toBe('C4-HI-01')
    expect(rejection.field).toBe('stock-concentration')
    expect(rejection.message).toMatch(/stock concentration/i)
    expect(rejection.message).toMatch(/cannot be zero or negative/i)
    // The physical reason, not a restatement of the rule.
    expect(rejection.message).toMatch(/cannot be diluted/i)
  })
})

describe('C4-HI-01, a top point that does not resolve to a stock volume (volume-anchored)', () => {
  it('rejects a top point entered as a concentration once the stock is declared not stated', () => {
    // Reproduced against the build: a top point entered as a concentration
    // (form 3) needs a stock concentration to resolve to a stock volume, and
    // 'not-stated-by-vendor' has none. Previously mislabelled C4-HI-06, which
    // is reserved for the computed-system check below and fires only once a
    // series exists to evaluate it against. This is the same failure to
    // resolve as the concentration-anchored case above, just anchored on
    // volume instead, so it shares that case's code rather than inventing one.
    const [rejection] = rejectionsFor({
      stock: { kind: 'not-stated-by-vendor' },
      topPoint: { form: 3, value: { value: 5, unit: 'ug/mL' } },
    })
    expect(rejection.code).toBe('C4-HI-01')
    expect(rejection.field).toBe('top-point')
    expect(rejection.message).toMatch(/does not resolve to a stock volume/i)
  })

  it('accepts the same stock declaration with the top point entered as a volume or a dilution factor', () => {
    expect(
      rejectionsFor({
        stock: { kind: 'not-stated-by-vendor' },
        topPoint: { form: 1, value: { value: 5, unit: 'uL' } },
      }),
    ).toEqual([])
    expect(
      rejectionsFor({
        stock: { kind: 'not-stated-by-vendor' },
        topPoint: { form: 4, value: 10 },
      }),
    ).toEqual([])
  })
})

describe('C4-HI-02, a staining volume that is zero or negative', () => {
  it.each([0, -10] as const)('rejects %s µL', (value) => {
    const [rejection] = rejectionsFor({ stainingVolume: { value, unit: 'uL' } })
    expect(rejection.code).toBe('C4-HI-02')
    expect(rejection.message).toMatch(/staining volume/i)
    expect(rejection.message).toMatch(/cannot occur in zero volume/i)
  })
})

describe('C4-HI-03, a negative cell number', () => {
  it('rejects it, and says zero is accepted', () => {
    const [rejection] = rejectionsFor({ cellNumber: { value: -1, unit: 'cells-1e6' } })
    expect(rejection.code).toBe('C4-HI-03')
    expect(rejection.message).toMatch(/cannot be negative/i)
    expect(rejection.message).toMatch(/zero is accepted/i)
  })

  it('does not reject zero, which is a no-cell control condition', () => {
    // Section 7: "Zero cells is legal as a no-cell control condition and shall
    // not be rejected defensively." It raises C4-FL-06 instead.
    expect(rejectionsFor({ cellNumber: { value: 0, unit: 'cells' } })).toEqual([])
  })
})

describe('C4-HI-04, a dilution factor of one or less', () => {
  it.each([1, 0.5, 0, -2] as const)('rejects a factor of %s', (dilutionFactor) => {
    const [rejection] = rejectionsFor({ dilutionFactor })
    expect(rejection.code).toBe('C4-HI-04')
    expect(rejection.message).toMatch(/must decrease in concentration/i)
  })

  it('accepts a non-integer factor above one, per C4-SR-02', () => {
    expect(rejectionsFor({ dilutionFactor: 2.5 })).toEqual([])
    expect(rejectionsFor({ dilutionFactor: 1.7 })).toEqual([])
    expect(rejectionsFor({ dilutionFactor: 3 })).toEqual([])
  })
})

describe('C4-HI-05, a point count outside 2 to 12 or not a whole number', () => {
  it.each([1, 0, -3, 13, 20, 6.5] as const)('rejects %s points', (points) => {
    const [rejection] = rejectionsFor({ points })
    expect(rejection.code).toBe('C4-HI-05')
    expect(rejection.message).toMatch(/whole number of points/i)
  })

  it.each([2, 6, 12] as const)('accepts %s points', (points) => {
    expect(rejectionsFor({ points })).toEqual([])
  })

  it('gives no reason for the upper bound that the constants register denies', () => {
    // This message used to say the cap existed "so that the whole series is
    // legible on one screen", while the `maximum-points` register row on the
    // same page said 12 was chosen by inspection and "not derived from any
    // arithmetic or layout constraint", the one-screen proxy having been
    // withdrawn at v0.5. Two statements on one page contradicting each other
    // is the class of defect this project keeps being caught by, so the
    // absence of a reason here is pinned rather than left to a reviewer.
    const [rejection] = rejectionsFor({ points: 13 })
    expect(rejection.message).not.toMatch(/one screen|legible|layout|fits?\b/i)
    const register = CONSTANTS_REGISTER.find((e) => e.id === 'maximum-points')
    expect(register?.status).toMatch(/not derived from any arithmetic or layout constraint/)
  })
})

describe('C4-HI-06, a point that cannot be reached from this stock', () => {
  it('rejects a top point whose stock volume equals the staining volume', () => {
    // C4-FX-16. At 200 µg/mL into 100 µL, a top point of 20 µg needs the whole
    // 100 µL of stock, so the tube is undiluted stock and holds nothing else.
    const [rejection] = rejectionsFor({ topPoint: { form: 2, value: 20 } })
    expect(rejection.code).toBe('C4-HI-06')
    expect(rejection.message).toMatch(/not more concentrated than the target/i)
    expect(rejection.message).toMatch(/leaving no room for the cells/i)
  })

  it('accepts a top point just below it', () => {
    // C4-FX-16's other half: rejected at equality, accepted below.
    expect(rejectionsFor({ topPoint: { form: 2, value: 19.9 } })).toEqual([])
  })

  it('names the point it is about', () => {
    const [rejection] = rejectionsFor({ topPoint: { form: 2, value: 25 } })
    expect(rejection.message).toMatch(/Point 1/)
  })
})

describe('C4-HI-07, a pipetting minimum that is zero or negative', () => {
  it.each([0, -1] as const)('rejects %s µL', (value) => {
    const [rejection] = rejectionsFor({ pipettingMinimum: { value, provenance: 'entered' } })
    expect(rejection.code).toBe('C4-HI-07')
    expect(rejection.message).toMatch(/no pipette delivers nothing reliably/i)
  })
})

describe('a rejection carries no series', () => {
  it('returns rejections instead of points, so nothing can read a result off one', () => {
    const outcome = computeSeries({ ...VALID, dilutionFactor: 1 })
    expect(outcome.ok).toBe(false)
    expect('points' in outcome).toBe(false)
  })
})
