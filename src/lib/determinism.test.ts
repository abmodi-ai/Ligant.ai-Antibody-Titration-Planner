import { describe, expect, it } from 'vitest'
import { computeSeries, isRejected } from './compute'
import { toJson } from './serialise'
import type { SeriesInputs } from './normalise'

/**
 * Acceptance 18 and 19, and C4-ST-04 and C4-ST-05.
 *
 * Same inputs, same outputs. No hidden state, no time dependence. Nothing in
 * `src/lib` reads a clock or a random source, and this is what establishes that
 * by execution rather than by inspection.
 *
 * C4-ST-05 claims determinism WITHIN ONE BROWSER ENGINE, and claims cross-engine
 * agreement only within the derived tolerance unless the generation method is
 * shown to be engine-independent. It is: exponentiation by squaring is a fixed
 * sequence of correctly rounded IEEE 754 multiplications. This suite runs in one
 * engine and can only test the weaker claim; the stronger one is argued in
 * generate.ts and measured by the reimplementation of acceptance 3.
 */

const BASE: SeriesInputs = {
  stock: { kind: 'stated', concentration: { value: 0.2, unit: 'mg/mL' }, massBasis: 'antibody-protein' },
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
  topPoint: { form: 2, value: 1 },
  dilutionFactor: 2,
  points: 6,
  imported: null,
}

function run(patch: Partial<SeriesInputs> = {}) {
  const outcome = computeSeries({ ...BASE, ...patch })
  if (isRejected(outcome)) throw new Error('expected a series')
  return outcome
}

describe('acceptance 18, the same inputs reproduce the series exactly', () => {
  it('is byte identical over ten runs', () => {
    const runs = Array.from({ length: 10 }, () => toJson(run()))
    expect(new Set(runs).size).toBe(1)
  })

  it('is byte identical when the input object is rebuilt rather than reused', () => {
    // Reusing one object would let a shared mutable field pass unnoticed.
    const a = toJson(computeSeries(structuredClone(BASE)) as never)
    const b = toJson(computeSeries(structuredClone(BASE)) as never)
    expect(a).toBe(b)
  })

  it('does not mutate the inputs it was given', () => {
    const inputs = structuredClone(BASE)
    const before = JSON.stringify(inputs)
    run()
    computeSeries(inputs)
    expect(JSON.stringify(inputs)).toBe(before)
  })
})

/**
 * Acceptance 19 and C4-ST-04: changing any input recomputes every point, and no
 * value computed at the previous inputs survives unmarked.
 *
 * Every input named by C4-ST-04 is changed in turn and the whole series is
 * required to move. A tool that recomputed only the points it thought were
 * affected would pass a test that changed one input and would fail this one.
 */
describe('acceptance 19, every input change recomputes every point', () => {
  const baseline = run()
  const concentrations = (result: ReturnType<typeof run>) =>
    result.points.map((p) => p.concentrationUgPerMl)

  /*
   * What "recomputes every point" does and does not mean, stated exactly.
   *
   * C4-ST-04 requires that no value computed at the previous inputs survives.
   * It does NOT require every displayed number to move, and asserting that it
   * did would be asserting something false about two inputs in particular:
   *
   *   THE STOCK CONCENTRATION, against a top point entered as a MASS. The
   *   anchor is the mass divided by the staining volume, which the stock does
   *   not enter, so the concentrations are unchanged and it is the VOLUMES and
   *   DILUTIONS that move. That is C4-SR-01 working: the entered form is the
   *   persisted input, and a mass stays a mass. A tool where the concentration
   *   moved here would have stored the derived volume instead.
   *
   *   THE DILUTION FACTOR, at point 1. Point 1 is the top point divided by an
   *   integer power of zero, so it is the top point unchanged whatever the
   *   factor is. Points 2 onward all move.
   *
   * Each is tested for what actually has to happen rather than for a blanket
   * rule that would have to be weakened until it asserted nothing.
   */
  it.each([
    ['the staining volume', { stainingVolume: { value: 50, unit: 'uL' } }],
    ['the top point', { topPoint: { form: 2, value: 2 } }],
  ] as const)('moves every point when %s changes', (_name, patch) => {
    const changed = run(patch as Partial<SeriesInputs>)
    const before = concentrations(baseline)
    const after = concentrations(changed)
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i]).not.toBe(before[i])
    }
  })

  it('moves every volume and dilution when the stock concentration changes', () => {
    const changed = run({
      stock: { kind: 'stated', concentration: { value: 0.4, unit: 'mg/mL' }, massBasis: 'antibody-protein' },
    })
    for (let i = 0; i < baseline.points.length; i += 1) {
      // The volumes halve and the dilutions double.
      expect(changed.points[i].volumeUl).not.toBe(baseline.points[i].volumeUl)
      expect(changed.points[i].forms[4]).not.toEqual(baseline.points[i].forms[4])
      // The concentrations do not move, because the top point was entered as a
      // mass and a mass does not depend on the stock.
      expect(changed.points[i].concentrationUgPerMl).toBe(baseline.points[i].concentrationUgPerMl)
    }
  })

  it('moves every point below the top when the dilution factor changes', () => {
    const changed = run({ dilutionFactor: 3 })
    // Point 1 is the top point and is unchanged by the factor, by construction.
    expect(changed.points[0].concentrationUgPerMl).toBe(baseline.points[0].concentrationUgPerMl)
    for (let i = 1; i < baseline.points.length; i += 1) {
      expect(changed.points[i].concentrationUgPerMl).not.toBe(
        baseline.points[i].concentrationUgPerMl,
      )
    }
  })

  it('changes the point count when the number of points changes', () => {
    expect(run({ points: 4 }).points).toHaveLength(4)
  })

  it('moves the derived quantities when the cell number changes', () => {
    const changed = run({ cellNumber: { value: 2, unit: 'cells-1e6' } })
    expect(changed.normalised.cellsPerUl).not.toBe(baseline.normalised.cellsPerUl)
    expect(changed.points[0].forms[5]).not.toEqual(baseline.points[0].forms[5])
  })

  /**
   * C4-FX-20 and acceptance 16: a top point entered as a volume survives a
   * change of stock concentration, and the series is recomputed from it.
   *
   * This is the C4-SR-01 rule doing its work. The retained input is the ENTERED
   * VOLUME; the anchor concentration is derived from it afresh. A tool that
   * stored the derived concentration instead would keep the old concentration
   * and quietly report a series belonging to the previous stock, which is the
   * transfer failure this tool exists to prevent, reproduced by the tool itself.
   */
  it('recomputes from the retained entered volume when the stock changes', () => {
    const entered = { form: 1, value: { value: 10, unit: 'uL' } } as const
    const before = run({ topPoint: entered })
    const after = run({
      topPoint: entered,
      stock: { kind: 'stated', concentration: { value: 0.4, unit: 'mg/mL' }, massBasis: 'antibody-protein' },
    })

    // The entered volume is unchanged, because it is the persisted input.
    expect(before.points[0].volumeUl).toBe(10)
    expect(after.points[0].volumeUl).toBe(10)

    // The derived concentration has doubled with the stock, and nothing from
    // the previous stock survives.
    expect(before.anchor).toEqual({ kind: 'concentration', ugPerMl: 20 })
    expect(after.anchor).toEqual({ kind: 'concentration', ugPerMl: 40 })
    expect(after.points[0].forms[3]).toMatchObject({ value: 40 })
    expect(after.points[0].forms[2]).toMatchObject({ value: 4 })
  })
})

describe('nothing in the engine reads a clock or a random source', () => {
  it('produces the same object a second apart', async () => {
    const first = toJson(run())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(toJson(run())).toBe(first)
  })
})
