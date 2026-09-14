/**
 * Display formatting.
 *
 * C4-UN-06: volumes and concentrations are displayed to three significant
 * figures, and the displayed precision is stated on the output (C4-OUT-07).
 * Three is the resolution at which a displayed volume corresponds to something
 * a pipette actually delivers, under the principle recorded in URS section 11:
 * displayed precision matches the resolution of the physical act the number
 * drives. C4 drives a pipette.
 *
 * ON THE ROUNDING MODE. C4-UN-09 requires round half away from zero, APPLIED TO
 * THE EXACT BINARY VALUE the implementation holds. Both halves of that sentence
 * matter, and the second is the harder one.
 *
 * The obvious implementation is `Number.prototype.toPrecision(3)`, which
 * resolves a tie to the larger candidate and is therefore half away from zero
 * for the positive quantities section 7 guarantees. It is rejected here for the
 * reason C1 records in its own formatter: `toPrecision` cannot tell you whether
 * a value was really halfway, because by the time you can see its output it has
 * already rounded. Neither can a round-trip test. The double nearest 0.15625 is
 * exactly 0.15625 and is a genuine tie; a computed value that prints as 1.005
 * is almost never one, and nothing about the decimal says which case you have.
 * Depending on `toPrecision` would make the rule an observation about a
 * JavaScript engine rather than a property of this tool.
 *
 * So the exact decimal expansion is computed instead. Every finite double is
 * exactly significand × 2^e and therefore exactly N / 10^k for integers N and
 * k >= 0, and `exactDecimal` below produces that N. Rounding then reads the
 * dropped digits directly and a tie is a tie by construction rather than by
 * inference. `exactDecimal` and `isExactTie` are ported from C1's format.ts
 * unchanged; only the rounding rule differs, because C1 rounds half to even
 * and this tool does not.
 *
 * ON DIVERGING FROM C1. C1's register names half-to-even, on the ground that it
 * is the IEEE 754 default and the default in Python, R and Julia, so an
 * independent reimplementation agrees without being told. URS section 11 scopes
 * half away from zero as a C1-onward convention adopted in C1 v0.6, which has
 * not happened. C4 ships the new rule; the constants register on the page
 * records that C1 has not yet adopted it, and the reimplementation of
 * acceptance 3 has to be told. That costs little, because acceptance 3 compares
 * unrounded values (C4-UN-07) and the rule reaches only the displayed ones.
 *
 * ON THE ADC. Its formatter is magnitude-adaptive, with fixed decimal places by
 * decade and a significant-figure branch below 0.01. That suits a quantity
 * always reported in one unit. It is not this rule and is not used here.
 */

import { ulp } from './ulp'

/** C4-UN-06. The one place the number three is written down. */
export const DISPLAY_SIG_FIGS = 3

/** URS section 11. The rounding mode is behaviour-determining and is named. */
export const ROUNDING_MODE = 'half-away-from-zero' as const

/** Stated on the output, per C4-OUT-07. */
export const PRECISION_STATEMENT =
  `Volumes and concentrations are displayed to ${DISPLAY_SIG_FIGS} significant figures, ` +
  'rounded half away from zero on the exact stored value. The unrounded value of every ' +
  'reported quantity is in the structured result.'

/**
 * The exact decimal expansion of a double, as an integer and a power of ten.
 *
 * Ported from C1 unchanged. Every finite double is exactly
 * `significand × 2^e`, and therefore exactly `N / 10^k` for integers N and
 * k >= 0. Computing that exactly is the only way to know whether a value is
 * really halfway.
 */
function exactDecimal(v: number): { digits: string; pointFromRight: number; negative: boolean } {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, v)
  const bits = view.getBigUint64(0)
  const negative = bits >> 63n === 1n
  const biasedExponent = Number((bits >> 52n) & 0x7ffn)
  const fraction = bits & 0xf_ffff_ffff_ffffn

  // Subnormals carry no implicit leading bit and sit at a fixed exponent.
  const significand = biasedExponent === 0 ? fraction : fraction | (1n << 52n)
  const exponent2 = biasedExponent === 0 ? -1074 : biasedExponent - 1075

  if (exponent2 >= 0) {
    return { digits: (significand << BigInt(exponent2)).toString(), pointFromRight: 0, negative }
  }
  // v = significand / 2^k = significand × 5^k / 10^k
  const k = -exponent2
  return { digits: (significand * 5n ** BigInt(k)).toString(), pointFromRight: k, negative }
}

/**
 * Round a digit string to `figs` significant digits, half away from zero.
 *
 * The sign is carried separately and every quantity this tool reports is
 * positive under section 7, so "away from zero" and "up" name the same
 * operation on these digits. C4-UN-09 is written as away from zero because that
 * is the rule a reimplementation in a language with signed rounding modes needs
 * to be given.
 *
 * `carried` is true only when rounding crossed a decade: 999 at three figures
 * becomes 1000, four digits, and has to become 1.00e+3.
 */
function roundHalfAwayFromZero(digits: string, figs: number): { digits: string; carried: boolean } {
  if (digits.length <= figs) return { digits: digits.padEnd(figs, '0'), carried: false }

  const kept = digits.slice(0, figs)
  const first = digits[figs]

  // The whole of the rule, and the whole of the difference from C1. A first
  // dropped digit of 5 rounds away from zero whatever follows it, so unlike
  // half-to-even this reads neither the remaining dropped digits nor the parity
  // of the last kept one. An exact tie and a value just above one take the same
  // branch, which is what makes the rule expressible to a reimplementation.
  if (first < '5') return { digits: kept, carried: false }

  const bumped = (BigInt(kept) + 1n).toString()
  if (bumped.length > figs) return { digits: bumped.slice(0, figs), carried: true }
  return { digits: bumped.padStart(figs, '0'), carried: false }
}

/**
 * Render to exactly `figs` significant figures, rounded half away from zero.
 *
 * Trailing zeros are kept: a top point of exactly 1 µg displays as `1.00`, not
 * `1`. Suppressing them would make "agrees to displayed precision" mean two
 * different things depending on the value, and the reference case of acceptance
 * 1 states `1.00`, `0.500` and `10.0`.
 *
 * The choice between fixed and exponential form matches `toPrecision`, so that
 * the tie behaviour is the only thing about this rendering that differs from
 * the platform default.
 */
export function formatSigFigs(v: number, figs: number = DISPLAY_SIG_FIGS): string {
  if (!Number.isFinite(v)) return 'n/a'
  if (v === 0) return figs > 1 ? `0.${'0'.repeat(figs - 1)}` : '0'

  const { digits, pointFromRight, negative } = exactDecimal(v)
  const trimmed = digits.replace(/^0+/, '') || '0'
  const leadingZeros = digits.length - trimmed.length
  // Scientific exponent before rounding.
  let exponent = digits.length - leadingZeros - pointFromRight - 1

  const rounded = roundHalfAwayFromZero(trimmed, figs)
  if (rounded.carried) exponent += 1

  const sign = negative ? '-' : ''
  const d = rounded.digits

  if (exponent < -6 || exponent >= figs) {
    const mantissa = figs > 1 ? `${d[0]}.${d.slice(1)}` : d[0]
    return `${sign}${mantissa}e${exponent >= 0 ? '+' : '-'}${Math.abs(exponent)}`
  }
  if (exponent >= 0) {
    const intPart = d.slice(0, exponent + 1)
    const fracPart = d.slice(exponent + 1)
    return `${sign}${intPart}${fracPart ? `.${fracPart}` : ''}`
  }
  return `${sign}0.${'0'.repeat(-exponent - 1)}${d}`
}

/**
 * Whether a value sits exactly halfway at `figs` significant figures.
 *
 * Exposed because C4-FX-22 requires every fixture to state whether its values
 * land on exact ties, and a fixture that asserted that by eye would be
 * asserting the thing the rule exists to settle. The reference case of
 * acceptance 1 uses this: points 5 and 6 are ties and the table is correct only
 * under round half away from zero.
 */
export function isExactTie(v: number, figs: number = DISPLAY_SIG_FIGS): boolean {
  if (!Number.isFinite(v) || v === 0) return false
  const { digits } = exactDecimal(v)
  const trimmed = digits.replace(/^0+/, '').replace(/0+$/, '')
  return trimmed.length === figs + 1 && trimmed.endsWith('5')
}

/**
 * How far a value sits from the nearest decimal tie, counted in ULPs.
 *
 * C4-FX-01 and acceptance 2 are checked against a hand calculation, and a hand
 * calculation cannot predict which side of a printed 1.005 the stored double
 * falls on: that is decided by bits the decimal does not show. Those fixtures
 * are therefore CONSTRUCTED so that no displayed value lies within one ULP of a
 * decimal tie, and C4-FX-22 requires the construction to be stated. This is
 * what lets a fixture assert that property rather than claim it.
 *
 * Computed on the exact decimal expansion rather than by building the nearest
 * tie as a double, because constructing that tie is itself a rounding and would
 * put an error of the size being measured into the measurement. The digits
 * after the first `figs` significant ones are read directly: their distance
 * from a leading 5 followed by zeros IS the distance from the tie, in units of
 * the last retained place, and one ULP is about 2e-14 of that unit at three
 * significant figures, so parsing the remainder as a double leaves roughly
 * three orders of headroom over the quantity being resolved.
 *
 * Returns 0 for a value that is an exact tie.
 */
export function ulpsFromDecimalTie(v: number, figs: number = DISPLAY_SIG_FIGS): number {
  if (!Number.isFinite(v) || v === 0) return Infinity

  const { digits, pointFromRight } = exactDecimal(v)
  const trimmed = digits.replace(/^0+/, '')
  if (trimmed === '') return Infinity
  if (trimmed.length <= figs) return Infinity

  const leadingZeros = digits.length - trimmed.length
  const exponent = digits.length - leadingZeros - pointFromRight - 1

  // The place value of the last retained significant figure.
  const step = 10 ** (exponent - figs + 1)
  const remainder = Number(`0.${trimmed.slice(figs)}`)
  const distanceInSteps = Math.abs(remainder - 0.5)

  return (distanceInSteps * step) / ulp(v)
}
