import { describe, expect, it } from 'vitest'
import { computeSeries, isRejected, type SeriesResult } from './compute'
import { REPORTABLE_PAIRS, UNDETECTABLE_FAILURES, CONSTANTS_REGISTER, reportablePair } from './flags'
import type { ImportedMolecularWeight, SeriesInputs } from './normalise'
import type { ImportedMassBasis, StockMassBasis } from './units'

/**
 * Section 8, and acceptances 11, 12 and 14.
 *
 * Every condition computes a result and raises a flag with a machine-readable
 * reason code; C4-FL-11 withholds form 6. Flags never block the determination,
 * so each test below asserts that a series was still produced.
 */

const BASE: SeriesInputs = {
  stock: { kind: 'stated', concentration: { value: 0.2, unit: 'mg/mL' }, massBasis: 'antibody-protein' },
  stockSource: 'certificate-of-analysis',
  vendor: { basis: 'none' },
  stainingVolume: { value: 100, unit: 'uL' },
  cellNumber: { value: 1, unit: 'cells-1e6' },
  pipettingMinimum: { value: 2, provenance: 'entered' },
  topPoint: { form: 2, value: 1 },
  dilutionFactor: 2,
  points: 3,
  imported: null,
}

function run(patch: Partial<SeriesInputs>): SeriesResult {
  const outcome = computeSeries({ ...BASE, ...patch })
  if (isRejected(outcome)) {
    throw new Error(`expected a series, got ${outcome.rejections.map((r) => r.code).join(', ')}`)
  }
  return outcome
}

const codes = (result: SeriesResult) => result.flags.map((f) => f.code)

const importedWeight = (
  massBasis: ImportedMassBasis,
  flags: { code: string; message: string }[] = [],
): ImportedMolecularWeight => ({
  gPerMol: 150_000,
  provenance: 'certificate-of-analysis',
  massBasis,
  flags,
  toolVersion: 'C1 v0.1.0',
})

describe('C4-FL-01, a staining volume differing from the vendor test volume', () => {
  const result = run({
    stainingVolume: { value: 50, unit: 'uL' },
    vendor: {
      basis: 'per-test-volume-stated',
      amountPerTest: { kind: 'volume', value: { value: 5, unit: 'uL' } },
      testVolume: { value: 100, unit: 'uL' },
      cellNumber: 'not-stated',
    },
  })

  it('is raised, and names the factor the concentration differs by', () => {
    expect(codes(result)).toContain('C4-FL-01')
    const flag = result.flags.find((f) => f.code === 'C4-FL-01')
    expect(flag?.message).toMatch(/factor of 0\.500/)
  })

  it('still reports both vendor multiples, distinctly labelled', () => {
    // C4-FX-05 and C4-DT-04. They differ here, which is the whole point of
    // reporting two of them.
    const multiple = result.points[0].vendorMultiple
    expect(multiple?.identical).toBe(false)
    expect(multiple?.atVendorTestVolume).not.toBe(multiple?.atStainingVolume)
  })
})

describe('C4-FL-02, a vendor basis of "test volume not stated"', () => {
  const result = run({
    vendor: {
      basis: 'per-test-volume-not-stated',
      amountPerTest: { kind: 'volume', value: { value: 5, unit: 'uL' } },
    },
  })

  it('is raised', () => {
    expect(codes(result)).toContain('C4-FL-02')
  })

  it('still reports every form at the declared volume, per C4-FX-12', () => {
    for (const point of result.points) {
      for (const form of [1, 2, 3, 4, 5] as const) {
        expect(point.forms[form].state).toBe('computed')
      }
    }
  })

  it('does not raise C4-FL-08, because there is no concentration to compare against', () => {
    expect(codes(result)).not.toContain('C4-FL-08')
  })
})

describe('C4-FL-03, points below the declared pipetting minimum', () => {
  it('names the points and carries them as point-level scope', () => {
    const result = run({ points: 6 })
    const flag = result.flags.find((f) => f.code === 'C4-FL-03')
    expect(flag?.points).toEqual([3, 4, 5, 6])
  })

  it('says when the minimum is the untouched suggestion rather than a decision', () => {
    // C4-SR-05 and R16. The default is on the behaviour path whenever it is
    // unchanged, so the flag distinguishes the two cases in words.
    const entered = run({ points: 6, pipettingMinimum: { value: 2, provenance: 'entered' } })
    const defaulted = run({ points: 6, pipettingMinimum: { value: 2, provenance: 'default' } })
    expect(entered.flags[0].message).toMatch(/declared minimum/)
    expect(defaulted.flags[0].message).toMatch(/suggested minimum/)
    expect(defaulted.flags[0].message).toMatch(/has not been changed/)
  })

  /**
   * C4-FX-10 and acceptance 12: the boundary, at two different declared minima.
   *
   * The operator as C4-FL-03 writes it is "below", so a point sitting exactly
   * on the minimum does not flag. Tested on both sides and exactly on it, at
   * two minima, because a boundary verified at one value could be right by
   * accident.
   */
  describe('the boundary, at two declared minima', () => {
    /*
     * Driven through a top point entered AS A VOLUME, per C4-SR-01.
     *
     * That makes the boundary exact rather than approached through a mass and
     * two conversions: the entered volume is converted to a concentration and
     * back to a volume, a round trip this tool holds to within 1 ULP, so a top
     * point entered as 2 µL lands on 2 µL and the operator is tested against
     * the value it is supposed to be tested against.
     *
     * Each case uses two points, so the second point is always below the
     * minimum and the flag is always present. What is being asserted is
     * therefore not whether the flag fired but whether it NAMES POINT 1, which
     * is the boundary question.
     */
    const flagsPointOne = (minimumUl: number, topUl: number): boolean => {
      const outcome = computeSeries({
        ...BASE,
        points: 2,
        pipettingMinimum: { value: minimumUl, provenance: 'entered' },
        topPoint: { form: 1, value: { value: topUl, unit: 'uL' } },
      })
      if (isRejected(outcome)) throw new Error('expected a series')
      const flag = outcome.flags.find((f) => f.code === 'C4-FL-03')
      return flag?.points?.includes(1) ?? false
    }

    it.each([
      [2, 2.01, false],
      [2, 2, false],
      [2, 1.99, true],
      [5, 5.01, false],
      [5, 5, false],
      [5, 4.99, true],
    ] as const)(
      'at a minimum of %s µL, a top point of %s µL names point 1: %s',
      (minimum, topUl, shouldFlag) => {
        expect(flagsPointOne(minimum, topUl)).toBe(shouldFlag)
      },
    )

    it('does not flag a point sitting exactly on the minimum, at either minimum', () => {
      // The operator as C4-FL-03 writes it is "below", so equality passes. A
      // boundary verified at one value could be right by accident, which is
      // why C4-FX-10 asks for two.
      expect(flagsPointOne(2, 2)).toBe(false)
      expect(flagsPointOne(5, 5)).toBe(false)
    })

    it('still names the points that genuinely are below', () => {
      const outcome = computeSeries({
        ...BASE,
        points: 2,
        pipettingMinimum: { value: 2, provenance: 'entered' },
        topPoint: { form: 1, value: { value: 2, unit: 'uL' } },
      })
      if (isRejected(outcome)) throw new Error('expected a series')
      // Point 1 is exactly on the minimum and point 2 is half of it.
      expect(outcome.flags.find((f) => f.code === 'C4-FL-03')?.points).toEqual([2])
    })
  })
})

describe('C4-FL-04, stock source not recorded', () => {
  it('is raised and says the series should not enter a method record', () => {
    const result = run({ stockSource: 'not-recorded' })
    expect(codes(result)).toContain('C4-FL-04')
    expect(result.flags.find((f) => f.code === 'C4-FL-04')?.message).toMatch(/cannot be traced/i)
  })
})

describe('C4-FL-05, a stock whose concentration the vendor does not state', () => {
  const result = run({
    stock: { kind: 'not-stated-by-vendor' },
    topPoint: { form: 1, value: { value: 10, unit: 'uL' } },
  })

  it('is raised', () => {
    expect(codes(result)).toContain('C4-FL-05')
  })

  it('reports forms 1 and 4, and the rest as not computable, per C4-FX-07', () => {
    // Never as zero, never as blank, never as an estimate.
    for (const point of result.points) {
      expect(point.forms[1].state).toBe('computed')
      expect(point.forms[4].state).toBe('computed')
      for (const form of [2, 3, 5, 6] as const) {
        expect(point.forms[form].state).toBe('not-computable')
        if (point.forms[form].state === 'not-computable') {
          expect(point.forms[form]).toHaveProperty('reason')
        }
      }
    }
  })

  it('computes the dilution factor as staining volume over stock volume', () => {
    // C4-UN-08, reached without a concentration.
    expect(result.points[0].forms[4]).toMatchObject({ state: 'computed', value: 10 })
  })
})

describe('C4-FL-06, zero cells', () => {
  const result = run({ cellNumber: { value: 0, unit: 'cells' } })

  it('is raised rather than rejected, per C4-FX-14', () => {
    expect(codes(result)).toContain('C4-FL-06')
    expect(result.points).toHaveLength(3)
  })

  it('reports form 5 as not computable, not as zero', () => {
    for (const point of result.points) {
      expect(point.forms[5].state).toBe('not-computable')
    }
  })
})

describe('C4-FL-07, a cell number differing from the vendor stated one', () => {
  const vendorWithCells = (cells: number) =>
    ({
      basis: 'per-test-volume-stated',
      amountPerTest: { kind: 'volume', value: { value: 5, unit: 'uL' } },
      testVolume: { value: 100, unit: 'uL' },
      cellNumber: { value: cells, unit: 'cells-1e6' },
    }) as const

  it('is raised where the numbers differ, per C4-FX-15', () => {
    expect(codes(run({ vendor: vendorWithCells(5) }))).toContain('C4-FL-07')
  })

  it('is not raised where they agree', () => {
    expect(codes(run({ vendor: vendorWithCells(1) }))).not.toContain('C4-FL-07')
  })

  it('is evaluated for a final-concentration basis too, per R17 and C4-FX-13', () => {
    const differing = run({
      vendor: {
        basis: 'final-concentration',
        concentration: { value: 2, unit: 'ug/mL' },
        cellNumber: { value: 5, unit: 'cells-1e6' },
      },
    })
    expect(codes(differing)).toContain('C4-FL-07')

    const agreeing = run({
      vendor: {
        basis: 'final-concentration',
        concentration: { value: 2, unit: 'ug/mL' },
        cellNumber: { value: 1, unit: 'cells-1e6' },
      },
    })
    expect(codes(agreeing)).not.toContain('C4-FL-07')
  })
})

describe('C4-FL-08, a series beginning below the vendor recommendation', () => {
  it('is raised, and the word saturation does not appear in it', () => {
    // R2. "Saturation" was removed from this flag and from every place outside
    // sections 9 and 15, because a vendor recommendation does not establish it.
    const result = run({
      topPoint: { form: 2, value: 0.1 },
      vendor: {
        basis: 'final-concentration',
        concentration: { value: 5, unit: 'ug/mL' },
        cellNumber: 'not-stated',
      },
    })
    const flag = result.flags.find((f) => f.code === 'C4-FL-08')
    expect(flag).toBeDefined()
    expect(flag?.message).toMatch(/not bracketed by this series/)
    expect(flag?.message.toLowerCase()).not.toContain('saturat')
    expect(flag?.remedy?.toLowerCase()).not.toContain('saturating the target')
  })

  it('is not raised where the top point is at or above the recommendation', () => {
    const result = run({
      vendor: {
        basis: 'final-concentration',
        concentration: { value: 5, unit: 'ug/mL' },
        cellNumber: 'not-stated',
      },
    })
    expect(codes(result)).not.toContain('C4-FL-08')
  })

  it('is evaluated against a dilution-factor recommendation under C4-UN-08', () => {
    // C4-FX-18: "1:100" is a factor of 100, so 200 µg/mL stock recommends
    // 2 µg/mL, and a top point of 10 µg/mL is above it.
    const result = run({
      vendor: {
        basis: 'final-concentration',
        concentration: { dilutionFactor: 100 },
        cellNumber: 'not-stated',
      },
    })
    expect(codes(result)).not.toContain('C4-FL-08')
    expect(result.vendor?.recommendedUgPerMl).toBe(2)
  })
})

describe('C4-FL-09 and C4-FL-10, what an import brings with it', () => {
  it('raises C4-FL-09 on a conjugate basis and reports form 6, per C4-FX-09', () => {
    const result = run({
      stock: { kind: 'stated', concentration: { value: 0.2, unit: 'mg/mL' }, massBasis: 'conjugate' },
      imported: importedWeight('conjugate', [{ code: 'C1-FL-08', message: 'Molecular weight includes label or payload.' }]),
    })
    expect(codes(result)).toContain('C4-FL-09')
    expect(codes(result)).toContain('C4-FL-10')
    expect(codes(result)).not.toContain('C4-FL-11')
    expect(result.points[0].forms[6].state).toBe('computed')
  })

  it('restates every imported flag in full rather than summarising', () => {
    const result = run({
      imported: importedWeight('assembled', [
        { code: 'C1-FL-05', message: 'Molecular weight provenance not recorded.' },
        { code: 'C1-FL-01', message: 'Outside the usual range for a biologic.' },
      ]),
    })
    const flag = result.flags.find((f) => f.code === 'C4-FL-10')
    expect(flag?.message).toContain('C1-FL-05')
    expect(flag?.message).toContain('Molecular weight provenance not recorded.')
    expect(flag?.message).toContain('C1-FL-01')
    expect(flag?.message).toContain('Outside the usual range for a biologic.')
  })

  it('does not raise C4-FL-10 where the imported object carries no flags', () => {
    expect(codes(run({ imported: importedWeight('assembled') }))).not.toContain('C4-FL-10')
  })
})

/**
 * C4-FL-11, C4-FX-19 and acceptance 14: the reportable pairs table.
 *
 * Every pair in the table is exercised, in both directions, because the whole
 * point of the second declaration audit that produced R13 was that a comparison
 * rule can silently lose a distinction one of its declarations makes.
 */
describe('C4-FL-11, the mass-basis pairs', () => {
  const withPair = (importedBasis: ImportedMassBasis, stockBasis: StockMassBasis) =>
    run({
      stock: { kind: 'stated', concentration: { value: 0.2, unit: 'mg/mL' }, massBasis: stockBasis },
      imported: importedWeight(importedBasis),
    })

  it.each([
    ['assembled', 'antibody-protein'],
    ['conjugate', 'conjugate'],
  ] as const)('reports form 6 for %s against %s', (importedBasis, stockBasis) => {
    const result = withPair(importedBasis, stockBasis)
    expect(codes(result)).not.toContain('C4-FL-11')
    expect(result.points[0].forms[6].state).toBe('computed')
    expect(result.form6WithheldReason).toBeNull()
  })

  it.each([
    ['monomer', 'antibody-protein', /monomer or single chain/],
    ['monomer', 'conjugate', /monomer or single chain/],
    ['monomer', 'not-recorded', /monomer or single chain/],
    ['assembled', 'not-recorded', /Stock mass basis not recorded/],
    ['conjugate', 'not-recorded', /Stock mass basis not recorded/],
    ['not-recorded', 'antibody-protein', /Molecular-weight mass basis not recorded/],
    ['not-recorded', 'conjugate', /Molecular-weight mass basis not recorded/],
    ['assembled', 'conjugate', /whole-molecule weight against conjugate mass/],
    ['conjugate', 'antibody-protein', /conjugate weight against protein mass/],
  ] as const)('withholds form 6 for %s against %s', (importedBasis, stockBasis, reason) => {
    const result = withPair(importedBasis, stockBasis)
    expect(codes(result)).toContain('C4-FL-11')
    const point = result.points[0]
    expect(point.forms[6].state).toBe('withheld')
    if (point.forms[6].state === 'withheld') expect(point.forms[6].reason).toMatch(reason)
  })

  it('names both declared bases in the flag, per C4-FX-19(a)', () => {
    const flag = withPair('conjugate', 'antibody-protein').flags.find((f) => f.code === 'C4-FL-11')
    expect(flag?.message).toMatch(/antibody protein/)
    expect(flag?.message).toMatch(/conjugate/)
  })

  it('states the single-chain reason for C4-FX-19(d)', () => {
    // R13 and editorial correction 2: an antibody-protein stock against a
    // monomer-or-single-chain weight withholds, with that reason and not the
    // generic one, because the rows are evaluated in order.
    const flag = withPair('monomer', 'antibody-protein').flags.find((f) => f.code === 'C4-FL-11')
    expect(flag?.message).toMatch(/not of the whole reagent/)
  })

  it('takes the first matching row where two rows both match', () => {
    // Editorial correction 1. A monomer weight against an unrecorded stock
    // basis matches both the monomer row and the unrecorded row; the monomer
    // row comes first and is the more specific of the two.
    expect(reportablePair('monomer', 'not-recorded').reason).toMatch(/monomer or single chain/)
    expect(reportablePair('not-recorded', 'not-recorded').reason).toMatch(/Stock mass basis not recorded/)
  })

  it('covers every pair of declared bases', () => {
    // A table missing a row would withhold by the fallback rather than by a
    // stated reason, and a reader would be told nothing useful.
    const imported: ImportedMassBasis[] = ['assembled', 'monomer', 'conjugate', 'not-recorded']
    const stock: StockMassBasis[] = ['antibody-protein', 'conjugate', 'not-recorded']
    for (const i of imported) {
      for (const s of stock) {
        const verdict = reportablePair(i, s)
        if (!verdict.reported) expect(verdict.reason).toBeTruthy()
      }
    }
    expect(REPORTABLE_PAIRS).toHaveLength(7)
  })
})

describe('the disclosure lists the page renders', () => {
  it('carries the fourteen failure classes of section 9', () => {
    // Acceptance 22 counts them.
    expect(UNDETECTABLE_FAILURES).toHaveLength(14)
    expect(UNDETECTABLE_FAILURES.some((f) => f.includes('Saturation'))).toBe(true)
    expect(UNDETECTABLE_FAILURES.some((f) => f.includes('Matrix transfer'))).toBe(true)
  })

  it('carries the constants register, with every uncharacterised value marked', () => {
    // Acceptance 21: the page states which are uncharacterised.
    // Measured but not yet accepted is its own state, and the register must not
    // collapse it into either "open" or "closed". A row claiming an owner's
    // decision on her behalf is the silent behaviour-determining choice section
    // 11 exists to prevent.
    const awaiting = CONSTANTS_REGISTER.filter((entry) => entry.value.includes('AWAITING SIGN-OFF'))
    expect(awaiting.map((e) => e.id).sort()).toEqual(['ratio-test-tolerance', 'round-trip-tolerance'])
    for (const entry of awaiting) {
      expect(entry.status).toMatch(/MEASURED, NOT YET ACCEPTED/)
      // The measurement itself is on the page, not only its status.
      expect(entry.value).toMatch(/\d+ ULP/)
    }
  })

  it('records that C1 has not yet adopted the rounding convention', () => {
    // The divergence found when C1's own register was read: it rounds half to
    // even and is to adopt half away from zero at its v0.6. Disclosed here
    // rather than left for a reader to discover by comparing two tools.
    const rounding = CONSTANTS_REGISTER.find((e) => e.id === 'rounding-mode')
    expect(rounding?.status).toMatch(/NOT YET ADOPTED IN C1/)
  })

  it('declares the viewport requirement it does not meet', () => {
    // C1's precedent: a requirement the tool DOES NOT MEET is declared in the
    // register, because this is the page's disclosure surface and an
    // undeclared shortfall is exactly what the register exists to prevent.
    const viewport = CONSTANTS_REGISTER.find((e) => e.id === 'viewport-supported')
    expect(viewport?.status).toMatch(/ACCEPTED DEVIATION/)
    expect(viewport?.status).toMatch(/THE POINT CAP IS NOT THE BINDING CONSTRAINT/)
  })

  it('records that the pipetting default is on the behaviour path when unchanged', () => {
    const minimum = CONSTANTS_REGISTER.find((e) => e.id === 'pipetting-minimum')
    expect(minimum?.status).toMatch(/ON THE BEHAVIOUR PATH WHENEVER IT IS UNCHANGED/)
  })
})
