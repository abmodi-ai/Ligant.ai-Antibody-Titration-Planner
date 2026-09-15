import { describe, expect, it } from 'vitest'
import { integerPower, series } from './generate'
import { ulpsBetween } from './ulp'

/**
 * Section 6, acceptance 6 and 8. C4-IV-03, C4-IV-05 and C4-IV-06.
 *
 * THE RATIO TEST. The ratio between the unrounded concentrations of consecutive
 * points must equal the declared dilution factor, within a derived tolerance,
 * AT EVERY POINT INCLUDING THE LAST. The last point is named in the requirement
 * because it is where an accumulating error is largest, and a test that stopped
 * at point 11 would miss exactly the defect this exists to find.
 *
 * THE TOLERANCE IS AN ANALYTIC BOUND, per C4-CN-01 as amended at v0.5: a
 * tolerance listed as derived is the bound over the stated operation set, not
 * an empirical maximum. The build's earlier 4 ULP figure was a sample maximum
 * over 3.3 million cases and is withdrawn as a tolerance; the distribution
 * below is kept as evidence the bound that replaces it is not loose.
 *
 * THE DERIVATION. `integerPower` builds f^(i-1) by exponentiation by squaring:
 * each squaring (`square *= square`) rounds, but `result *= square` is EXACT
 * whenever `result` is still 1, which is true up to and including the first set
 * bit of the exponent. Counting only the roundings that actually occur, the
 * worst pair over a 12-point series (exponents 10 and 11, i.e. the last ratio,
 * per the same reasoning that names the last point in C4-IV-03) is:
 *
 *   f^10:  4 rounding multiplies (5 total, one exact at the first set bit)
 *   f^11:  5 rounding multiplies (6 total, one exact at the first set bit)
 *   point[10] = top / f^10:      1 division
 *   point[11] = top / f^11:      1 division
 *   ratio = point[10] / point[11]: 1 division
 *                                  -----------------
 *                                  9 multiplies + 3 divisions = 12 operations
 *
 * Each operation contributes at most half an ULP, so the analytic bound is
 * 12 x 0.5 = 6 ULP. This is a requirement rather than an observation: an
 * implementation that generated the series another way could exceed it, which
 * is precisely why C4-IV-06 makes the method something the tool must state.
 * Verified against an instrumented count of `integerPower`'s actual rounding
 * multiplies for every exponent 0 to 11, not asserted from the trace alone.
 *
 * MEASURED, over 3,300,000 consecutive ratios: twelve points, dilution factors
 * drawn from 1.01 to 20, top points across ten decades. The distribution of the
 * error, rounded up to whole ULPs:
 *
 *     0 ULP   2,028,739      3 ULP       1,500
 *     1 ULP   1,200,613      4 ULP           9
 *     2 ULP      69,139      above 4         0
 *
 * The empirical maximum, 4 ULP, sits under the 6 ULP analytic bound with a
 * two-ULP margin: evidence the bound is not loose, not the tolerance itself.
 *
 * The derivation is recorded in docs/open-item-06-derived-tolerances.md.
 */

/** The derived bound. Compared with `<=`. */
export const RATIO_TEST_TOLERANCE_ULP = 6

const TOP_POINTS = [10, 7.3, 0.145, 123.456] as const

describe('acceptance 6, the ratio holds at every point of a 12-point series', () => {
  /*
   * Factors of 2, 3 and one non-integer, as acceptance 6 names them.
   *
   * 2.5 is chosen for the non-integer case rather than something like 1.7
   * because it exercises a different property: 2.5 is 5/2, so its integer
   * powers up to the eleventh are exactly representable and the series is
   * exact, which makes it a check that the method does not introduce error
   * where none is forced. 1.7 is added alongside it as the genuinely inexact
   * case, where the method must instead stay inside the bound.
   */
  it.each([
    ['2, dyadic and exact', 2],
    ['3, integer', 3],
    ['2.5, non-integer with exact powers', 2.5],
    ['1.7, non-integer with inexact powers', 1.7],
  ] as const)('holds at a factor of %s', (_name, factor) => {
    for (const top of TOP_POINTS) {
      const points = series(top, factor, 12)
      expect(points).toHaveLength(12)
      for (let i = 1; i < points.length; i += 1) {
        const ratio = points[i - 1] / points[i]
        expect(ulpsBetween(ratio, factor)).toBeLessThanOrEqual(RATIO_TEST_TOLERANCE_ULP)
      }
    }
  })

  it('holds at the last point, which is where an accumulated error would be largest', () => {
    for (const factor of [2, 3, 2.5, 1.7]) {
      for (const top of TOP_POINTS) {
        const points = series(top, factor, 12)
        const lastRatio = points[10] / points[11]
        expect(ulpsBetween(lastRatio, factor)).toBeLessThanOrEqual(RATIO_TEST_TOLERANCE_ULP)
      }
    }
  })

  it('returns the top point unchanged, bit for bit', () => {
    // Point 1 divides by an integer power of zero, which is exactly 1, so
    // C4-SR-03's index-1 guarantee is an identity rather than an approximation.
    for (const top of TOP_POINTS) {
      expect(series(top, 1.7, 12)[0]).toBe(top)
    }
  })
})

/**
 * C4-IV-06, the reason `Math.pow` is not used, measured rather than asserted.
 *
 * ECMAScript does not require `Math.pow` to be correctly rounded, and by how
 * much it disagrees with a correctly-rounded primitive is ENGINE-DEPENDENT: it
 * is not itself a figure this tool can assert as a fixed quantity, only that it
 * is real, non-zero, and of the same order as the tolerance rather than
 * negligible beside it. Asserting a specific magnitude here would be exactly
 * the mistake C4-CN-01 now forbids for the tolerance itself, repeated one level
 * down: an empirical figure from one engine is not a fact about every engine.
 */
describe('the generation method is not interchangeable with Math.pow', () => {
  it('disagrees with Math.pow at a factor with inexact powers', () => {
    let worst = 0
    for (const top of TOP_POINTS) {
      for (let i = 0; i < 12; i += 1) {
        const bySquaring = top / integerPower(1.7, i)
        const byPow = top / Math.pow(1.7, i)
        worst = Math.max(worst, ulpsBetween(bySquaring, byPow))
      }
    }
    // Real and non-zero on every engine this has been run on, which is the
    // property this test exists to confirm. The exact magnitude is not
    // asserted against RATIO_TEST_TOLERANCE_ULP: it is engine-dependent, and
    // was as low as 2 ULP and as high as 4 ULP across engines observed during
    // development, both within the 6 ULP analytic bound but neither equal to
    // it. A series generated by `pow` could sit inside the tolerance on one
    // engine and outside it on another, which is the actual defect this
    // confirms rather than a specific number.
    expect(worst).toBeGreaterThan(0)
  })

  it('agrees with Math.pow where the powers are exact, which is why one case proves nothing', () => {
    // At a factor of 3 every power up to the eleventh is an exact integer below
    // 2^53, so both primitives return the same value. A confirmation run only
    // at integer factors would have found no difference and concluded there was
    // none to find.
    for (const top of TOP_POINTS) {
      for (let i = 0; i < 12; i += 1) {
        expect(top / integerPower(3, i)).toBe(top / Math.pow(3, i))
      }
    }
  })
})

/**
 * C4-IV-05 and acceptance 8: the ratio test is confirmed capable of FAILING,
 * with its sensitivity bounded on BOTH sides.
 *
 * The defect inserted is the one a plausible implementation would actually
 * have: generating each point by multiplying the previous one, with a rounding
 * applied at each step. That is how a spreadsheet does it, and it is the defect
 * the stated method exists to avoid, so it is the right thing to confirm
 * against.
 *
 * R18 requires the confirmation to record the precision at which detection
 * occurs AND the coarsest precision at which it does not, so that the
 * tolerance's sensitivity is bounded from both directions rather than only
 * demonstrated once. Recording only the detected side would leave a reader
 * unable to tell a sensitive test from a lucky one.
 */
describe('acceptance 8, the ratio test is confirmed capable of failing', () => {
  /** Repeated multiplication, with a rounding to `sigFigs` inserted each step. */
  function repeatedWithRounding(top: number, factor: number, points: number, sigFigs: number): number[] {
    const values = [top]
    for (let i = 1; i < points; i += 1) {
      values.push(Number((values[i - 1] / factor).toPrecision(sigFigs)))
    }
    return values
  }

  /** The worst consecutive-ratio error such a series reaches, in ULPs. */
  function worstRatioError(sigFigs: number): number {
    let worst = 0
    for (const top of TOP_POINTS) {
      for (const factor of [2, 3, 1.7]) {
        const values = repeatedWithRounding(top, factor, 12, sigFigs)
        for (let i = 1; i < values.length; i += 1) {
          worst = Math.max(worst, ulpsBetween(values[i - 1] / values[i], factor))
        }
      }
    }
    return worst
  }

  it('detects an inserted rounding at 15 significant figures', () => {
    // The recorded DETECTED precision. At 15 significant figures the
    // accumulated error reaches about 35 ULP, comfortably clear of the 6 ULP
    // bound.
    const worst = worstRatioError(15)
    expect(worst).toBeGreaterThan(RATIO_TEST_TOLERANCE_ULP)
    expect(worst).toBeGreaterThan(30)
  })

  it('does not detect an inserted rounding at 16 significant figures', () => {
    // The recorded COARSEST UNDETECTED precision, and the honest half of the
    // result. At 16 significant figures the inserted rounding moves the series
    // by about 3 ULP, inside the derived bound, so this test would pass a
    // series generated the wrong way. That is not a hole to be closed by
    // tightening the bound: 16 significant figures is close enough to the
    // 17 digits a double carries that the defect is genuinely almost absent.
    // What it means is stated rather than left implicit: a repeated-multiply
    // implementation that rounded no more coarsely than this would be
    // indistinguishable from the stated method by this test alone.
    const worst = worstRatioError(16)
    expect(worst).toBeLessThanOrEqual(RATIO_TEST_TOLERANCE_ULP)
  })

  it('detects it more emphatically as the inserted rounding coarsens', () => {
    // Monotone in the direction it should be, which is what shows the 15-figure
    // result is the edge of the test's sensitivity rather than an artefact.
    const at13 = worstRatioError(13)
    const at10 = worstRatioError(10)
    const at6 = worstRatioError(6)
    expect(at13).toBeGreaterThan(worstRatioError(15))
    expect(at10).toBeGreaterThan(at13)
    expect(at6).toBeGreaterThan(at10)
  })
})
