import { describe, expect, it } from 'vitest'
import { computeSeries, isRejected, type SeriesResult } from './compute'
import {
  SCHEMA_NAME,
  SCHEMA_VERSION,
  reproduceFrom,
  toJson,
  toStructuredResult,
  validateStructuredResult,
} from './serialise'
import type { SeriesInputs } from './normalise'

/**
 * Acceptance 4, C4-OUT-03 and C4-OUT-04.
 *
 * Every series produces a structured object validating against the format, WITH
 * POINT-LEVEL FLAG SCOPE, or the C4-OUT-04 escalation is recorded. Both have
 * happened: the escalation is in docs/open-item-08-shared-format-finding.md,
 * and the schema this validates against is C4's own, built out of C1's shapes
 * rather than by extending C1's object. The reasoning is in serialise.ts.
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
  points: 6,
  imported: null,
}

/** The whole fixture set, so validation is not established on one shape. */
const FIXTURES: Record<string, SeriesInputs> = {
  reference: BASE,
  withImport: {
    ...BASE,
    imported: {
      gPerMol: 150_000,
      provenance: 'certificate-of-analysis',
      massBasis: 'assembled',
      flags: [],
      toolVersion: 'C1 v0.1.0',
    },
  },
  withheldForm6: {
    ...BASE,
    stock: { kind: 'stated', concentration: { value: 0.2, unit: 'mg/mL' }, massBasis: 'conjugate' },
    imported: {
      gPerMol: 150_000,
      provenance: 'not-recorded',
      massBasis: 'assembled',
      flags: [{ code: 'C1-FL-05', message: 'Provenance not recorded.' }],
      toolVersion: 'C1 v0.1.0',
    },
  },
  noStockConcentration: {
    ...BASE,
    stock: { kind: 'not-stated-by-vendor' },
    topPoint: { form: 1, value: { value: 10, unit: 'uL' } },
  },
  zeroCells: { ...BASE, cellNumber: { value: 0, unit: 'cells' } },
  vendorStated: {
    ...BASE,
    vendor: {
      basis: 'per-test-volume-stated',
      amountPerTest: { kind: 'volume', value: { value: 5, unit: 'uL' } },
      testVolume: { value: 50, unit: 'uL' },
      cellNumber: { value: 2, unit: 'cells-1e6' },
    },
  },
  twelvePointsNonInteger: { ...BASE, points: 12, dilutionFactor: 1.7 },
  defaultedMinimum: { ...BASE, pipettingMinimum: { value: 2, provenance: 'default' } },
}

function run(inputs: SeriesInputs): SeriesResult {
  const outcome = computeSeries(inputs)
  if (isRejected(outcome)) throw new Error('expected a series')
  return outcome
}

describe('acceptance 4, every series validates against the format', () => {
  it.each(Object.keys(FIXTURES))('validates the %s fixture', (name) => {
    const structured = toStructuredResult(run(FIXTURES[name]))
    expect(validateStructuredResult(structured)).toEqual([])
  })

  it('names itself and carries a schema version separate from the engine', () => {
    const structured = toStructuredResult(run(BASE))
    expect(structured.schema).toEqual({ name: SCHEMA_NAME, version: SCHEMA_VERSION })
    // C4-NF-06 ties the engine version to calculation behaviour. A change to
    // the shape of this object is not a change to the numbers, and versioning
    // them together would make one of them lie.
    expect(structured.tool.engineVersion).not.toBe(structured.schema.version)
  })
})

/**
 * The property C4-OUT-04 turns on, and the reason open item 8 was escalated.
 *
 * C4-FL-03 names specific points. A series-level flag list loses WHICH, and a
 * consumer planning an intermediate working stock, which is what C3 will do,
 * needs them. This is what a format has to be able to carry.
 */
describe('C4-OUT-04, point-level flag scope', () => {
  const structured = toStructuredResult(run(BASE))

  it('gives every point its own flag array, present even when empty', () => {
    for (const point of structured.series.points) {
      expect(Array.isArray(point.flags)).toBe(true)
    }
  })

  it('puts C4-FL-03 on the points it names, and on no others', () => {
    const flagged = structured.series.points
      .filter((p) => p.flags.some((f) => f.code === 'C4-FL-03'))
      .map((p) => p.index)
    expect(flagged).toEqual([3, 4, 5, 6])
  })

  it('carries the same flag at series level, so neither view is the only one', () => {
    expect(structured.flags.map((f) => f.code)).toEqual(['C4-FL-03'])
    expect(structured.flags[0].points).toEqual([3, 4, 5, 6])
  })

  it('rejects an object whose points have lost their flag arrays', () => {
    // What validation is for: the failure mode the escalation was about.
    const damaged = structuredClone(structured) as unknown as Record<string, any>
    delete damaged.series.points[0].flags
    const problems = validateStructuredResult(damaged)
    expect(problems.some((p) => p.problem.includes('point-level flag scope'))).toBe(true)
  })
})

describe('C4-UN-07, the unrounded value is present and is not the displayed one', () => {
  const structured = toStructuredResult(run(BASE))

  it('carries the unrounded double for every computed form', () => {
    expect(structured.series.points[4].forms['1']).toMatchObject({ state: 'computed', value: 0.3125 })
    expect(structured.series.points[4].displayed['1']).toBe('0.313')
  })

  it('attaches a unit to every quantity that has one', () => {
    for (const point of structured.series.points) {
      for (const form of Object.values(point.forms)) {
        if (form.state === 'computed') expect(form.unit).not.toBe('')
      }
    }
  })

  it('says why a form has no value rather than reporting zero or blank', () => {
    const structuredNoStock = toStructuredResult(run(FIXTURES.noStockConcentration))
    const form2 = structuredNoStock.series.points[0].forms['2']
    expect(form2.state).toBe('not-computable')
    if (form2.state !== 'computed') expect(form2.reason).toMatch(/not computable/)
  })

  it('distinguishes withheld from not computable', () => {
    // Two different absences. One says the declarations do not determine the
    // value; the other says they do and the tool is declining to report it.
    const withheld = toStructuredResult(run(FIXTURES.withheldForm6))
    expect(withheld.series.points[0].forms['6'].state).toBe('withheld')
    const noCells = toStructuredResult(run(FIXTURES.zeroCells))
    expect(noCells.series.points[0].forms['5'].state).toBe('not-computable')
  })
})

/**
 * C4-OUT-05: the object alone is sufficient to reproduce the reported result.
 *
 * Written as code rather than asserted in a comment, so that dropping a field
 * the reproduction needs stops this compiling or stops it agreeing. Run over
 * the whole fixture set, so sufficiency is established by execution.
 */
describe('C4-OUT-05, the object reproduces the result', () => {
  it.each(Object.keys(FIXTURES))('reproduces the %s fixture exactly', (name) => {
    const original = run(FIXTURES[name])
    const reproduced = reproduceFrom(toStructuredResult(original))
    expect(toJson(reproduced)).toBe(toJson(original))
  })
})

describe('C4-OUT-01 and C4-OUT-02, what the object has to carry', () => {
  it('records whether the pipetting minimum was entered or defaulted', () => {
    // C4-SR-05 and R16. The default is on the behaviour path whenever it is
    // unchanged, so a handoff that lost this would present a suggestion as a
    // decision.
    expect(toStructuredResult(run(BASE)).declarations.pipettingMinimum.provenance).toBe('entered')
    expect(
      toStructuredResult(run(FIXTURES.defaultedMinimum)).declarations.pipettingMinimum.provenance,
    ).toBe('default')
  })

  it('records the cell density, with no threshold attached to it', () => {
    // C4-SC-04: recorded as a declaration of the condition the series was
    // designed under, and deliberately not compared against anything.
    const density = toStructuredResult(run(BASE)).declarations.cellDensity
    expect(density.value).toBe(10_000)
    expect(density.unit).toBe('cells/uL')
  })

  it('echoes the top point in the form it was entered in', () => {
    // C4-SR-01. A consumer receiving only the derived anchor could not tell a
    // volume-entered series from a mass-entered one.
    const asVolume = toStructuredResult(run({ ...BASE, topPoint: { form: 1, value: { value: 5, unit: 'uL' } } }))
    expect(asVolume.inputs.topPoint).toEqual({ form: 1, value: { value: 5, unit: 'uL' } })
  })

  it('states the generation method the ratio tolerance was derived over', () => {
    const structured = toStructuredResult(run(BASE))
    expect(structured.series.generationMethod).toMatch(/exponentiation by squaring/)
    expect(structured.series.generationMethod).toMatch(/Math\.pow is not used/)
  })

  it('carries the relations applied and every required statement', () => {
    const structured = toStructuredResult(run(BASE))
    expect(structured.derivation.relations.length).toBeGreaterThan(0)
    expect(structured.statements.scope).toMatch(/Not qualified for GxP/)
    expect(structured.statements.stainingVolume).toMatch(/final volume/)
    expect(structured.statements.dilutionConvention).toMatch(/final volume divided by stock volume/)
    expect(structured.statements.precision).toMatch(/half away from zero/)
    expect(structured.statements.determinesNotVerifies).toMatch(/does not verify what was prepared/)
  })

  it('restates an imported object and its flags', () => {
    const structured = toStructuredResult(run(FIXTURES.withheldForm6))
    expect(structured.declarations.imported?.massBasis).toBe('assembled')
    expect(structured.declarations.imported?.flags).toHaveLength(1)
  })
})

describe('the serialised form', () => {
  it('is stable, so two runs of one case diff cleanly', () => {
    expect(toJson(run(BASE))).toBe(toJson(run(BASE)))
  })

  it('round trips through JSON without loss', () => {
    const structured = toStructuredResult(run(BASE))
    expect(validateStructuredResult(JSON.parse(JSON.stringify(structured)))).toEqual([])
  })
})
