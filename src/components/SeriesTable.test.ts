import { describe, expect, it } from 'vitest'
import { computeSeries, isRejected, type SeriesResult } from '../lib/compute'
import type { SeriesInputs } from '../lib/normalise'
import { notebookLine, vendorBasisSummary, vendorMultipleAbsentReason } from './SeriesTable'

/**
 * I3, Nadira's second review. "Copy for notebook" carried only staining
 * volume, cell number, points as volume/concentration and bare flag codes.
 * These tests pin the fields she asked added: stock concentration and its
 * provenance, the vendor basis and its values, whether the pipetting
 * minimum was entered or left at the default, mass per test and mass per
 * 10⁶ cells per point, and each flag's one-line summary rather than its
 * bare code.
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
  stainingVolume: { value: 50, unit: 'uL' },
  cellNumber: { value: 2, unit: 'cells-1e6' },
  pipettingMinimum: { value: 1, provenance: 'entered' },
  topPoint: { form: 3, value: { value: 8, unit: 'ug/mL' } },
  dilutionFactor: 2,
  points: 3,
  imported: null,
}

function run(patch: Partial<SeriesInputs> = {}): SeriesResult {
  const outcome = computeSeries({ ...BASE, ...patch })
  if (isRejected(outcome)) {
    throw new Error(`expected a series, got ${outcome.rejections.map((r) => r.code).join(', ')}`)
  }
  return outcome
}

describe('notebookLine', () => {
  it('carries stock concentration and its provenance', () => {
    const line = notebookLine(run())
    expect(line).toMatch(/Stock 0\.2 mg\/mL, antibody protein, certificate of analysis/)
  })

  it('says when the stock concentration is not stated by the vendor', () => {
    const line = notebookLine(
      run({ stock: { kind: 'not-stated-by-vendor' }, topPoint: { form: 1, value: { value: 10, unit: 'uL' } } }),
    )
    expect(line).toMatch(/Stock concentration not stated by the vendor/)
  })

  it('carries the vendor basis and its recommended value, not just its label', () => {
    const line = notebookLine(run())
    expect(line).toMatch(/Vendor: per test, with the test volume stated by the vendor, 10\.0 µg\/mL at the vendor's volume/)
  })

  it('says nothing extra about the vendor where none was declared', () => {
    const line = notebookLine(run({ vendor: { basis: 'none' } }))
    expect(line).not.toMatch(/Vendor:/)
  })

  it('carries the pipetting minimum and whether it was entered or defaulted', () => {
    const entered = notebookLine(run({ pipettingMinimum: { value: 1, provenance: 'entered' } }))
    expect(entered).toMatch(/Pipetting minimum 1\.00 µL \(entered\)/)
    const defaulted = notebookLine(run({ pipettingMinimum: { value: 2, provenance: 'default' } }))
    expect(defaulted).toMatch(/Pipetting minimum 2\.00 µL \(default\)/)
  })

  it('carries each point’s mass per test and mass per 10⁶ cells, not only volume and concentration', () => {
    const line = notebookLine(run())
    // Point 1: 8 µg/mL x 50 µL staining volume = 0.4 µg/test; over 2e6 cells
    // declared here, that is 0.2 µg/1e6 cells.
    expect(line).toContain('1: 2.00 µL (8.00 µg/mL) 0.400 µg/test 0.200 µg/10⁶ cells')
  })

  it('carries each flag as its one-line summary, not its bare code', () => {
    const line = notebookLine(run())
    expect(line).toMatch(/Flags: C4-FL-01 \(vendor volume 100 µL is not 50\.0 µL, 2\.00 times concentration\)/)
    expect(line).not.toMatch(/Flags: C4-FL-01, C4-FL-03/)
  })
})

describe('vendorBasisSummary', () => {
  it('is shared between the sticky declaration line and the notebook line', () => {
    const result = run()
    expect(vendorBasisSummary(result)).toMatch(/10\.0 µg\/mL at the vendor's volume/)
    expect(notebookLine(result)).toContain(vendorBasisSummary(result))
  })

  it('falls back to the bare label where no recommendation reduces to a concentration', () => {
    const result = run({
      vendor: { basis: 'per-test-volume-not-stated', amountPerTest: { kind: 'volume', value: { value: 5, unit: 'uL' } } },
    })
    expect(vendorBasisSummary(result)).toBe('per test, test volume not stated by the vendor')
  })
})

describe('vendorMultipleAbsentReason', () => {
  it('is null where the vendor multiple column is shown', () => {
    expect(vendorMultipleAbsentReason(run())).toBeNull()
  })

  it('is null where no vendor recommendation was declared', () => {
    expect(vendorMultipleAbsentReason(run({ vendor: { basis: 'none' } }))).toBeNull()
  })

  it('I6: names the reason when the vendor basis itself has no test volume', () => {
    const result = run({
      vendor: { basis: 'per-test-volume-not-stated', amountPerTest: { kind: 'volume', value: { value: 5, unit: 'uL' } } },
    })
    expect(vendorMultipleAbsentReason(result)).toMatch(/does not reduce to a concentration/)
  })

  it('I6: names the different reason when the series itself has no concentration (C4-AB-03)', () => {
    const result = run({
      stock: { kind: 'not-stated-by-vendor' },
      topPoint: { form: 1, value: { value: 10, unit: 'uL' } },
      vendor: {
        basis: 'per-test-volume-stated',
        amountPerTest: { kind: 'mass', ug: 1 },
        testVolume: { value: 100, unit: 'uL' },
        cellNumber: 'not-stated',
      },
    })
    // The vendor amount is a MASS, so it needs no stock concentration and
    // does reduce to a concentration; the series itself, anchored on
    // volume under C4-AB-03, is the half that has none.
    expect(result.vendor?.recommendedUgPerMl).not.toBeNull()
    expect(vendorMultipleAbsentReason(result)).toMatch(/no stock concentration is stated/)
  })

  it('I6: a third reachable route to the same "does not reduce" reason, a dilution factor with no stock', () => {
    // final-concentration + a dilution factor reads the factor against the
    // STOCK's own concentration (C4-UN-08), so C4-AB-03 (stock not stated)
    // leaves it unresolved too, by a route that names neither a test volume
    // nor a volume of the vendor's own stock. The wording above was fixed
    // to stop naming only the first two routes and mis-describing this one.
    const result = run({
      stock: { kind: 'not-stated-by-vendor' },
      topPoint: { form: 1, value: { value: 10, unit: 'uL' } },
      vendor: {
        basis: 'final-concentration',
        concentration: { dilutionFactor: 100 },
        cellNumber: 'not-stated',
      },
    })
    expect(result.vendor?.recommendedUgPerMl).toBeNull()
    expect(vendorMultipleAbsentReason(result)).toMatch(/does not reduce to a concentration under the declared basis/)
  })
})
