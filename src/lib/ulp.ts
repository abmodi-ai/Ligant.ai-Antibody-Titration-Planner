/**
 * Distance in units in the last place.
 *
 * The tolerances of C4-IV-01 and C4-IV-03 are open item 6 and are to be DERIVED
 * by measurement rather than chosen, so the measurement needs a unit. An
 * absolute tolerance would mean different things at different magnitudes, and a
 * relative one is the same as this to within a factor of two while being harder
 * to reason about: a bound of "1 ULP" says exactly that two values are adjacent
 * representable doubles, which is the smallest disagreement that can exist and
 * therefore the smallest bound worth asserting.
 */

/** The distance to the next representable double above `v`. */
export function ulp(v: number): number {
  const magnitude = Math.abs(v)
  if (!Number.isFinite(magnitude)) return NaN
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, magnitude)
  view.setBigUint64(0, view.getBigUint64(0) + 1n)
  return view.getFloat64(0) - magnitude
}

/**
 * How many ULPs apart two values are, measured at the larger of them.
 *
 * Measured at the larger, so that the answer does not depend on argument order
 * across a power-of-two boundary, where the spacing changes.
 */
export function ulpsBetween(a: number, b: number): number {
  if (a === b) return 0
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity
  const spacing = ulp(Math.max(Math.abs(a), Math.abs(b)))
  return Math.abs(a - b) / spacing
}
