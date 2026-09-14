import { describe, expect, it } from 'vitest'
import {
  DISPLAY_SIG_FIGS,
  ROUNDING_MODE,
  formatSigFigs,
  isExactTie,
  ulpsFromDecimalTie,
} from './format'

/*
 * The rule C4-UN-09 states, and the reason it had to be stated.
 *
 * A 2-fold series from a round top point lands on exact binary ties. 0.3125 and
 * 0.15625 are exactly representable, so the tie is real rather than an artefact
 * of the decimal. Round-half-up primitives give 0.313; round-half-to-even
 * primitives, which is Python's `round` and C1's formatter, give 0.312. Both
 * are correct under their own rule, and a reimplementation checking a displayed
 * value would disagree with this tool on two points of the reference case. That
 * is the whole reason the rule is written down.
 */
describe('the exact binary ties of the reference case', () => {
  it.each([
    [0.3125, '0.313'],
    [0.15625, '0.156'],
    [0.03125, '0.0313'],
    [0.0625, '0.0625'],
    [0.625, '0.625'],
  ] as const)('rounds %s away from zero to %s', (value, displayed) => {
    expect(formatSigFigs(value)).toBe(displayed)
  })

  /*
   * Which of the three values acceptance 1 names are actually ties at three
   * significant figures, measured rather than assumed.
   *
   * The URS assumption statement for acceptance 1 names 0.3125, 0.15625 and
   * 0.03125 together as landing on exact binary ties. Two of them do. 0.15625
   * does not: its significant digits are 1, 5, 6, 2, 5, so the first dropped
   * digit at three figures is a 2 and the value rounds down under every rule.
   * It reaches 0.156 whichever convention is applied.
   *
   * This does not move a single number in the reference table, and it is
   * recorded here rather than quietly passed over because C4-FX-22 requires a
   * fixture to state the assumption it was constructed under, and a fixture
   * that restated an imprecise claim would be asserting the thing the rule
   * exists to settle. The two genuine ties are what make the table depend on
   * C4-UN-09.
   */
  it.each([0.3125, 0.03125] as const)('records %s as a genuine tie', (value) => {
    expect(isExactTie(value)).toBe(true)
  })

  it('does not record 0.15625 as a tie at three figures, because it is not one', () => {
    expect(isExactTie(0.15625)).toBe(false)
    expect(formatSigFigs(0.15625)).toBe('0.156')
  })

  it('parts company with half-to-even on the two values that are ties', () => {
    // Not an assertion about this tool alone: an assertion that the two rules
    // disagree here. The last kept digit is even in both, so half-to-even keeps
    // it and this tool carries.
    expect(formatSigFigs(0.3125)).toBe('0.313')
    expect(formatSigFigs(0.03125)).toBe('0.0313')
  })
})

describe('the whole of the reference table renders as URS section 16 states it', () => {
  it.each([
    [5, '5.00'],
    [2.5, '2.50'],
    [1.25, '1.25'],
    [0.625, '0.625'],
    [0.3125, '0.313'],
    [0.15625, '0.156'],
    [1, '1.00'],
    [0.5, '0.500'],
    [0.25, '0.250'],
    [0.125, '0.125'],
    [0.0625, '0.0625'],
    [0.03125, '0.0313'],
    [10, '10.0'],
    [2.5, '2.50'],
    [20, '20.0'],
    [40, '40.0'],
    [80, '80.0'],
    [160, '160'],
    [320, '320'],
    [640, '640'],
  ] as const)('renders %s as %s', (value, displayed) => {
    expect(formatSigFigs(value)).toBe(displayed)
  })
})

describe('trailing zeros are kept', () => {
  it('renders exactly one as 1.00, not as 1', () => {
    // Suppressing them would make "agrees to displayed precision" mean two
    // different things depending on the value.
    expect(formatSigFigs(1)).toBe('1.00')
    expect(formatSigFigs(0.5)).toBe('0.500')
  })
})

describe('rounding that carries across a decade', () => {
  it('moves the exponent rather than emitting a fourth digit', () => {
    // 999.5 is dyadic and therefore a real tie: it rounds away from zero to
    // 1000, which is four digits at three significant figures.
    expect(formatSigFigs(999.5)).toBe('1.00e+3')
  })

  it('is decided by the stored value even where the decimal looks like a tie', () => {
    // 0.0009995 is not representable. The nearest double is below it, its exact
    // expansion continues 99949999..., and it therefore rounds DOWN. Printed,
    // the input looks like a textbook tie; it is not one, and no rounding rule
    // could make it round up without being wrong about the number it holds.
    expect(isExactTie(0.0009995)).toBe(false)
    expect(formatSigFigs(0.0009995)).toBe('0.000999')
  })
})

describe('values that are not ties', () => {
  it('rounds by the stored value, not by the decimal that prints', () => {
    // The double nearest 1.005 is below it, so it rounds down under every rule.
    // A hand calculation cannot predict that from the decimal, which is why
    // C4-FX-01 is constructed to avoid this neighbourhood entirely.
    expect(isExactTie(1.005)).toBe(false)
    expect(formatSigFigs(1.005)).toBe('1.00')
  })

  it('reports how far a value sits from the nearest tie', () => {
    // Well clear: a fixture built on these is safe for a hand check.
    expect(ulpsFromDecimalTie(2.16)).toBeGreaterThan(1)
    expect(ulpsFromDecimalTie(0.37)).toBeGreaterThan(1)
    // Within one ULP: exactly the case a hand calculation cannot settle.
    expect(ulpsFromDecimalTie(1.005)).toBeLessThan(1)
  })
})

describe('the constants the page states', () => {
  it('displays three significant figures, rounded half away from zero', () => {
    expect(DISPLAY_SIG_FIGS).toBe(3)
    expect(ROUNDING_MODE).toBe('half-away-from-zero')
  })
})
