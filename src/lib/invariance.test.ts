import { describe, expect, it } from 'vitest'
import { normalise, type SeriesInputs } from './normalise'
import { ulpsBetween } from './ulp'

/**
 * Section 6, acceptance 5 and 7. C4-IV-01 and C4-IV-02.
 *
 * THE ROUND TRIP. A concentration is converted to a volume per test and back,
 * at the same staining volume and stock concentration, and must return the
 * input to within a derived tolerance, on UNROUNDED values.
 *
 * THE TOLERANCE IS DERIVED HERE, which is half of URS open item 6, and it is a
 * REQUIREMENT ON HOW THE CONVERSION IS STRUCTURED rather than an observation
 * about it. The round trip is two operations, a multiply and a divide by the
 * SAME folded constant, because `normalise.ts` folds the staining volume and
 * the stock concentration into one number at entry. Each operation contributes
 * at most half an ULP, so the analytic bound is 1 ULP. Had the unit factors
 * been applied stepwise the trip would be six operations and the bound three
 * times as loose: C1 measured exactly that on its own conversion and found the
 * stepwise path exceeding a 1 ULP bound in 0.54% of cases against zero
 * exceedances folded. The figure below is therefore not inherited from C1; it
 * is measured here, over this tool's own operation set.
 *
 * The measurement is recorded in docs/open-item-06-derived-tolerances.md.
 */

/** The derived bound. Compared with `<=`, as C1 states its own. */
export const ROUND_TRIP_TOLERANCE_ULP = 1

const BASE: SeriesInputs = {
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

/**
 * The round trip, written out in the open.
 *
 * A referee can read these two lines without reading the implementation, which
 * is the point of stating them here rather than calling into it.
 */
function roundTrip(concentration: number, volumePerConcentration: number): number {
  const volume = concentration * volumePerConcentration
  return volume / volumePerConcentration
}

/** A deterministic pseudo-random sweep. No Math.random: the suite must not vary. */
function* sweep(count: number): Generator<{ concentration: number; stockUgPerMl: number; stainingVolumeUl: number }> {
  let seed = 0x2545f491
  const next = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    seed >>>= 0
    return seed / 0x100000000
  }
  for (let i = 0; i < count; i += 1) {
    yield {
      // Eleven decades of concentration, five of volume: wider than anything a
      // bench produces, so the bound is not a property of the examples.
      concentration: 10 ** (next() * 11 - 5),
      stockUgPerMl: 10 ** (next() * 8 - 2),
      stainingVolumeUl: 10 ** (next() * 5 - 1),
    }
  }
}

describe('acceptance 5, concentration to volume and back', () => {
  it('returns the input within the derived tolerance over 200,000 cases', () => {
    let worst = 0
    let exceeded = 0
    for (const trial of sweep(200_000)) {
      const volumePerConcentration = trial.stainingVolumeUl / trial.stockUgPerMl
      if (!Number.isFinite(volumePerConcentration) || volumePerConcentration === 0) continue
      const returned = roundTrip(trial.concentration, volumePerConcentration)
      if (!Number.isFinite(returned) || returned === 0) continue
      const distance = ulpsBetween(trial.concentration, returned)
      if (distance > worst) worst = distance
      if (distance > ROUND_TRIP_TOLERANCE_ULP) exceeded += 1
    }
    // Recorded rather than merely asserted, so the margin is visible if this
    // ever tightens: the bound is not "no failures observed", it is 1 ULP.
    expect(worst).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE_ULP)
    expect(exceeded).toBe(0)
  })

  it('holds on the reference case itself, at every point', () => {
    const base = normalise(BASE)
    const perConcentration = base.volumePerConcentration as number
    for (const concentration of [10, 5, 2.5, 1.25, 0.625, 0.3125]) {
      expect(ulpsBetween(concentration, roundTrip(concentration, perConcentration))).toBeLessThanOrEqual(
        ROUND_TRIP_TOLERANCE_ULP,
      )
    }
  })
})

/**
 * C4-IV-02 and acceptance 7: the test is confirmed capable of FAILING.
 *
 * A test that has never failed is not evidence, it is an untested assertion.
 * Three defects are inserted into the round trip, each of a kind that a
 * plausible implementation could contain, and each must be both detected AND
 * shown to exceed the derived tolerance by a recorded margin. If a defect were
 * detected only marginally, the tolerance would be too loose to be worth
 * asserting.
 *
 * The magnitudes below are recorded in docs/open-item-06-derived-tolerances.md.
 */
describe('acceptance 7, the round trip is confirmed capable of failing', () => {
  const perConcentration = normalise(BASE).volumePerConcentration as number
  const CASES = [10, 5, 2.5, 1.25, 0.625, 0.3125]

  /** A plausibility ceiling, of the kind that pins a large result. */
  const clamp = (c: number, k: number) => {
    const volume = Math.min(c * k, 4)
    return volume / k
  }

  /** A floor at the pipetting minimum, of the kind that lifts a small result. */
  const floor = (c: number, k: number) => {
    const volume = Math.max(c * k, 2)
    return volume / k
  }

  /**
   * A nudge of a stated number of units in the last place.
   *
   * Parameterised rather than fixed at one, because the size is the finding.
   * See the sensitivity test below.
   */
  const nudgeBy = (ulps: number) => (c: number, k: number) => {
    const volume = c * k
    const view = new DataView(new ArrayBuffer(8))
    view.setFloat64(0, volume)
    view.setBigUint64(0, view.getBigUint64(0) + BigInt(ulps))
    return view.getFloat64(0) / k
  }

  /*
   * How many of the six points each defect reaches, stated rather than left as
   * "at least one".
   *
   * A clamp and a floor are RANGE defects: they change only the values on their
   * own side of the threshold, so a confirmation asserting that either moved
   * every point would be asserting something false and would have to be
   * weakened until it asserted almost nothing. The reference case has one point
   * above a 4 µL ceiling and four below a 2 µL floor, and those are the counts.
   * A nudge is not a range defect and reaches all six.
   *
   * Stating the exact count is what makes this a confirmation rather than a
   * formality: if a future change moved a point across either threshold, the
   * count would move with it and say so.
   */
  it.each([
    ['a clamp', clamp, 1],
    ['a floor', floor, 4],
    ['a nudge of two ULPs', nudgeBy(2), 6],
  ] as const)('detects %s on %i of the six points', (_name, defect, expected) => {
    let worst = 0
    let detected = 0
    for (const concentration of CASES) {
      const distance = ulpsBetween(concentration, defect(concentration, perConcentration))
      if (distance > ROUND_TRIP_TOLERANCE_ULP) detected += 1
      if (distance > worst) worst = distance
    }
    expect(detected).toBe(expected)
    expect(worst).toBeGreaterThan(ROUND_TRIP_TOLERANCE_ULP)
  })

  /**
   * The sensitivity of the round-trip test, bounded on BOTH sides.
   *
   * C4-IV-05 asks for this of the ratio test. It is done here too, because the
   * same question applies and because the answer is not the comfortable one: a
   * displacement of exactly one ULP in the volume survives the return division
   * at exactly one ULP, and the bound is compared with "less than or equal", so
   * a one-ULP defect is NOT DETECTED. It sits precisely on the boundary.
   *
   * That is not a hole to be closed by tightening the bound. One ULP is the
   * smallest difference two doubles can have, so a tolerance that excluded it
   * would be a tolerance of zero, and a correct reimplementation in a language
   * with wider intermediates or with FMA contraction would then fail against
   * correct code. The honest statement is the one C1 also records: a defect
   * uniformly smaller than or equal to one ULP is invisible to this test, and
   * anything larger is caught.
   *
   * The consequence is stated rather than left implicit, because a reader of
   * acceptance 7 is entitled to know what the confirmation does not cover.
   */
  it('records the smallest detected displacement and the largest undetected one', () => {
    const worstAt = (ulps: number) =>
      Math.max(...CASES.map((c) => ulpsBetween(c, nudgeBy(ulps)(c, perConcentration))))

    // Undetected: exactly on the bound.
    expect(worstAt(1)).toBe(1)
    expect(worstAt(1)).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE_ULP)

    // Detected: the next representable step, and every step beyond it.
    expect(worstAt(2)).toBe(2)
    expect(worstAt(2)).toBeGreaterThan(ROUND_TRIP_TOLERANCE_ULP)
    expect(worstAt(4)).toBeGreaterThan(ROUND_TRIP_TOLERANCE_ULP)
  })

  it('records the magnitude the structural defects reach', () => {
    // A clamp and a floor move a value by a large multiple of its own
    // magnitude, so they are detected by an enormous margin. These are the
    // numbers acceptance 7 asks to be recorded.
    const clampMagnitude = Math.max(...CASES.map((c) => ulpsBetween(c, clamp(c, perConcentration))))
    const floorMagnitude = Math.max(...CASES.map((c) => ulpsBetween(c, floor(c, perConcentration))))
    expect(clampMagnitude).toBeGreaterThan(1e12)
    expect(floorMagnitude).toBeGreaterThan(1e12)
  })
})

/**
 * C4-IV-04: the same quantity entered in two units agrees, over the path
 * INCLUDING unit normalisation. This has its own register row and its own
 * derived bound, separate from the round-trip tolerance above: that tolerance
 * is derived over the round trip ALONE, taking `volumePerConcentration` as
 * given; this one is derived over the conversion that PRODUCES it, which the
 * round trip does not exercise. Conflating the two would mean the register row
 * stated a bound nothing here actually measured.
 *
 * THE DERIVATION. `VOLUME_TO_UL.uL` and `CONCENTRATION_TO_UG_PER_ML['ug/mL']`
 * are both exactly 1: multiplying by 1 is exact in IEEE 754, so a quantity
 * entered in the BASE unit carries no conversion rounding at all. A quantity
 * entered in any other unit (mL, mg/mL) carries exactly one conversion
 * multiply, at most half an ULP.
 *
 * Worst case: staining volume entered in mL AND stock concentration entered in
 * mg/mL, compared against both entered in their base units.
 *
 *   base-unit path:      0 conversion multiplies, then 1 division to form
 *                         volumePerConcentration               = 1 operation
 *   non-base-unit path:  2 conversion multiplies (one per quantity), then
 *                         1 division                            = 3 operations
 *
 * Each path's relative error from the true value is bounded by its own
 * operation count x half an ULP: <=0.5 ULP for the base-unit path, <=1.5 ULP
 * for the non-base-unit path. The two paths are compared against EACH OTHER,
 * not against a round trip on a shared constant, so their errors do not
 * cancel: the bound on their difference is the SUM, 0.5 + 1.5 = 2 ULP.
 *
 * This is deliberately not inherited from the round-trip figure: it is a
 * different operation count over a different path, per C4-IV-04's own register
 * row.
 */
export const UNIT_NORMALISATION_TOLERANCE_ULP = 2

describe('C4-IV-04, the unit paths agree over the path including normalisation', () => {
  const inMicrolitres: SeriesInputs = { ...BASE, stainingVolume: { value: 100, unit: 'uL' } }
  const inMillilitres: SeriesInputs = { ...BASE, stainingVolume: { value: 0.1, unit: 'mL' } }
  const inMgPerMl: SeriesInputs = BASE
  const inUgPerMl: SeriesInputs = {
    ...BASE,
    stock: { kind: 'stated', concentration: { value: 200, unit: 'ug/mL' }, massBasis: 'antibody-protein' },
  }

  it('agrees between microlitres and millilitres, on the reference case', () => {
    const a = normalise(inMicrolitres)
    const b = normalise(inMillilitres)
    expect(ulpsBetween(a.stainingVolumeUl, b.stainingVolumeUl)).toBeLessThanOrEqual(
      UNIT_NORMALISATION_TOLERANCE_ULP,
    )
    expect(
      ulpsBetween(a.volumePerConcentration as number, b.volumePerConcentration as number),
    ).toBeLessThanOrEqual(UNIT_NORMALISATION_TOLERANCE_ULP)
  })

  it('agrees between mg/mL and µg/mL, on the reference case', () => {
    const a = normalise(inMgPerMl)
    const b = normalise(inUgPerMl)
    expect(ulpsBetween(a.stockUgPerMl as number, b.stockUgPerMl as number)).toBeLessThanOrEqual(
      UNIT_NORMALISATION_TOLERANCE_ULP,
    )
  })

  it('holds over a swept range, on the worst-case pairing of units', () => {
    // The worst case per the derivation above: volume in mL against volume in
    // µL, concentration in mg/mL against concentration in µg/mL, together, so
    // that both conversion multiplies are on the same side of the comparison
    // and the errors do not have a chance to cancel by coincidence.
    let worst = 0
    let exceeded = 0
    for (const trial of sweep(50_000)) {
      const base: SeriesInputs = {
        ...BASE,
        stainingVolume: { value: trial.stainingVolumeUl, unit: 'uL' },
        stock: { kind: 'stated', concentration: { value: trial.stockUgPerMl, unit: 'ug/mL' }, massBasis: 'antibody-protein' },
      }
      const converted: SeriesInputs = {
        ...BASE,
        stainingVolume: { value: trial.stainingVolumeUl / 1000, unit: 'mL' },
        stock: { kind: 'stated', concentration: { value: trial.stockUgPerMl / 1000, unit: 'mg/mL' }, massBasis: 'antibody-protein' },
      }
      const a = normalise(base)
      const b = normalise(converted)
      const av = a.volumePerConcentration as number
      const bv = b.volumePerConcentration as number
      if (!Number.isFinite(av) || !Number.isFinite(bv) || av === 0 || bv === 0) continue
      const distance = ulpsBetween(av, bv)
      if (distance > worst) worst = distance
      if (distance > UNIT_NORMALISATION_TOLERANCE_ULP) exceeded += 1
    }
    expect(worst).toBeLessThanOrEqual(UNIT_NORMALISATION_TOLERANCE_ULP)
    expect(exceeded).toBe(0)
  })
})
