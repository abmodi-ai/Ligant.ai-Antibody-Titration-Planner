import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computeSeries, isRejected } from '../src/lib/compute'
import { FORMS } from '../src/lib/units'
import { ulpsBetween } from '../src/lib/ulp'
import type { SeriesInputs } from '../src/lib/normalise'

/**
 * URS acceptance 3, executed.
 *
 * "An independent reimplementation in a second language agrees with the shipped
 * implementation on the full fixture set, compared on the UNROUNDED structured
 * values within the derived tolerance. Code review does not satisfy this test."
 *
 * So this is not a code review. It runs both implementations over the same
 * fixture inputs and compares every unrounded value, including the ones the
 * interface never shows.
 *
 * THIS FILE LIVES OUTSIDE src/ ON PURPOSE. It imports node:fs and
 * node:child_process, and the application's TypeScript project targets a
 * browser with no node types: a test that imports node:fs inside src/ passes
 * under vitest and fails the typecheck. That is the same reason the check
 * scripts are plain .mjs. Vitest still collects it, because its include pattern
 * is rooted at the repository rather than at src/.
 *
 * WHAT IS NOT COMPARED is the displayed value. Correctness must not depend on a
 * formatting choice, and the two languages differ there by default: Python's
 * `round` is half-to-even and C4-UN-09 is half away from zero. The rounding
 * rule is stated to the reimplementation rather than discovered by it, and
 * nothing it computes depends on it.
 */

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The derived agreement tolerance, and why it is a REQUIREMENT rather than an
 * observation.
 *
 * Measured: exact agreement, 0 ULP, on every value of every fixture. Making
 * bit-identical the requirement would generalise one measured pair of
 * implementations into a claim about every future one, and a language with
 * wider intermediates or with FMA contraction can differ in the last bit on the
 * same operations while being entirely correct. So the bound is one ULP and the
 * observed figure is asserted separately, which keeps any drift from exact
 * agreement visible rather than absorbed.
 *
 * Stated rather than left implicit: a defect uniformly smaller than one ULP is
 * invisible to this test, exactly as it is to the round trip of acceptance 5.
 */
const AGREEMENT_TOLERANCE_ULP = 1

interface Fixture {
  id: string
  assumption: string
  inputs: SeriesInputs
}

interface PythonPoint {
  index: number
  forms: Record<string, number | null>
}

interface PythonResult {
  anchor: { basis: string; value: number }
  cellDensity: number
  points: PythonPoint[]
}

const fixtures: Fixture[] = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8')).fixtures

/**
 * Run the reimplementation. A missing interpreter is a FAILURE and not a skip:
 * acceptance 3 is a gate item, and a gate that quietly passes when it cannot be
 * run is worse than no gate.
 */
function runPython(): Record<string, PythonResult> {
  const out = execFileSync('python3', [join(here, 'compute.py')], {
    cwd: here,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(out)
}

const python = runPython()

describe('acceptance 3, an independent reimplementation agrees', () => {
  it('covers the whole fixture set, and every fixture states its construction', () => {
    // C4-FX-22. A fixture that did not say how it was constructed could not be
    // audited, and the set as a whole has to be mixed rather than uniformly
    // dyadic, which the assumptions are what make checkable.
    expect(fixtures.length).toBeGreaterThanOrEqual(10)
    for (const fixture of fixtures) {
      expect(fixture.assumption.length).toBeGreaterThan(40)
      expect(python[fixture.id]).toBeDefined()
    }
  })

  it.each(fixtures.map((f) => f.id))('agrees on every unrounded value of %s', (id) => {
    const fixture = fixtures.find((f) => f.id === id) as Fixture
    const outcome = computeSeries(fixture.inputs)
    if (isRejected(outcome)) throw new Error(`${id} was rejected: ${outcome.rejections[0].code}`)
    const theirs = python[id]

    expect(theirs.points).toHaveLength(outcome.points.length)
    expect(ulpsBetween(theirs.anchor.value, outcome.anchor.kind === 'concentration' ? outcome.anchor.ugPerMl : outcome.anchor.ul)).toBeLessThanOrEqual(AGREEMENT_TOLERANCE_ULP)
    expect(ulpsBetween(theirs.cellDensity, outcome.normalised.cellsPerUl)).toBeLessThanOrEqual(
      AGREEMENT_TOLERANCE_ULP,
    )

    for (const point of outcome.points) {
      const theirPoint = theirs.points[point.index - 1]
      expect(theirPoint.index).toBe(point.index)
      for (const form of FORMS) {
        const ours = point.forms[form]
        const their = theirPoint.forms[String(form)]
        if (ours.state === 'computed') {
          // A value one implementation computes and the other does not is a
          // disagreement about what is computable, which is as much a defect as
          // a disagreement about a number.
          expect(their, `${id} point ${point.index} form ${form} is absent in Python`).not.toBeNull()
          expect(
            ulpsBetween(their as number, ours.value),
            `${id} point ${point.index} form ${form}`,
          ).toBeLessThanOrEqual(AGREEMENT_TOLERANCE_ULP)
        } else {
          expect(their, `${id} point ${point.index} form ${form} should not be computed`).toBeNull()
        }
      }
    }
  })

  it('agrees exactly, which is the observed figure rather than the requirement', () => {
    // Recorded so that any drift away from bit-identical agreement shows up as
    // a change here rather than being absorbed by the one-ULP bound.
    let worst = 0
    let compared = 0
    for (const fixture of fixtures) {
      const outcome = computeSeries(fixture.inputs)
      if (isRejected(outcome)) continue
      const theirs = python[fixture.id]
      for (const point of outcome.points) {
        for (const form of FORMS) {
          const ours = point.forms[form]
          const their = theirs.points[point.index - 1].forms[String(form)]
          if (ours.state !== 'computed' || their === null) continue
          worst = Math.max(worst, ulpsBetween(their, ours.value))
          compared += 1
        }
      }
    }
    expect(compared).toBeGreaterThan(200)
    expect(worst).toBe(0)
  })
})

/**
 * C4-IV-04 and C4-FX-02, checked across the language boundary as well.
 *
 * The microlitre path and the millilitre path are separate fixtures, so a
 * normalisation applied twice in either implementation would show up as a
 * disagreement between two fixtures that describe the same system.
 */
describe('the unit paths agree in both implementations', () => {
  it('reaches the same series through microlitres and through millilitres', () => {
    const reference = python['acceptance-1-reference']
    const millilitres = python['c4-fx-02-millilitre-path']
    for (let i = 0; i < reference.points.length; i += 1) {
      for (const form of ['1', '2', '3', '4', '5']) {
        const a = reference.points[i].forms[form] as number
        const b = millilitres.points[i].forms[form] as number
        expect(ulpsBetween(a, b)).toBeLessThanOrEqual(AGREEMENT_TOLERANCE_ULP)
      }
    }
  })
})
