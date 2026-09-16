import { describe, expect, it } from 'vitest'
import { FIELD_GUIDANCE, GUIDED_FIELD_IDS } from './guidance'
import { computeSeries, isRejected, type SeriesResult } from './compute'
import { notebookLine } from '../components/SeriesTable'
import { toJson } from './serialise'
import type { SeriesInputs } from './normalise'

/**
 * C4-OUT-12, and acceptance T7: guidance belongs in the input control and is
 * not carried into any displayed value.
 *
 * The structural half of that is that neither `serialise.ts` nor
 * `notebookLine` imports `guidance.ts`. This is the behavioural half, pinned
 * against a future edit that decides a "helpful" sentence belongs on the
 * output: a method record must carry what the user declared, not the tool's
 * advice about how to declare it.
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
  points: 6,
  imported: null,
}

function run(): SeriesResult {
  const outcome = computeSeries(BASE)
  if (isRejected(outcome)) throw new Error('expected a series')
  return outcome
}

/** A distinctive run of words from each entry, long enough not to collide. */
const fingerprint = (text: string) => text.split(' ').slice(0, 9).join(' ')

describe('field guidance', () => {
  it('covers every field the input-guidance document lists, and nothing else', () => {
    expect([...GUIDED_FIELD_IDS].sort()).toEqual(
      [
        'cell-number',
        'dilution-factor',
        'pipetting-minimum',
        'points',
        'staining-volume',
        'staining-volume-unit',
        'stock-kind',
        'stock-mass-basis',
        'stock-source',
        'stock-unit',
        'stock-value',
        'top-form',
        'top-value',
        'vendor-amount',
        'vendor-basis',
        'vendor-cells',
        'vendor-cells-kind',
        'vendor-test-volume',
      ].sort(),
    )
  })

  it('is substantial prose for every field, none left as a placeholder', () => {
    for (const id of GUIDED_FIELD_IDS) {
      expect(FIELD_GUIDANCE[id].length).toBeGreaterThan(40)
      expect(FIELD_GUIDANCE[id].trim()).toBe(FIELD_GUIDANCE[id])
    }
  })

  /**
   * The brief says: "If copy does not fit in about 60 words, the copy is too
   * long, not the tooltip too small."
   *
   * Three supplied entries exceed that: `vendor-basis` at 77 words,
   * `pipetting-minimum` at 72 and `stock-mass-basis` at 65. They are NOT
   * trimmed here: the copy is the URS author's, delivered as final text
   * rather than as a brief, and quietly editing a declaration's guidance
   * down to hit a guideline is the kind of silent change this project does
   * not make. The bound below is set where the supplied copy actually sits,
   * and the three exceptions are named, so that new copy cannot drift past
   * them unnoticed and so the ones that already do are visible rather than
   * absorbed.
   */
  it('fits the panel it is shown in, with the supplied exceptions named', () => {
    const over60 = GUIDED_FIELD_IDS.filter((id) => FIELD_GUIDANCE[id].split(/\s+/).length > 60)
    expect([...over60].sort()).toEqual(['pipetting-minimum', 'stock-mass-basis', 'vendor-basis'])
    for (const id of GUIDED_FIELD_IDS) {
      const words = FIELD_GUIDANCE[id].split(/\s+/).length
      expect(words, `${id} is ${words} words`).toBeLessThanOrEqual(80)
    }
  })

  it('T7: no guidance sentence reaches the notebook copy', () => {
    const line = notebookLine(run())
    for (const id of GUIDED_FIELD_IDS) {
      expect(line).not.toContain(fingerprint(FIELD_GUIDANCE[id]))
    }
  })

  it('T7: no guidance sentence reaches the structured object', () => {
    const json = toJson(run())
    for (const id of GUIDED_FIELD_IDS) {
      expect(json).not.toContain(fingerprint(FIELD_GUIDANCE[id]))
    }
  })

  it('keeps the two conventions that must stay on the page out of guidance alone', () => {
    // C4-OUT-10 and C4-OUT-11 are required disclosures on the OUTPUT. The
    // guidance may restate them, and the staining-volume entry deliberately
    // does, but the page must not rely on a hover target to carry them. The
    // statements themselves live in flags.ts and are asserted on the page by
    // check-network.mjs; this only pins that guidance is not their only home.
    expect(FIELD_GUIDANCE['staining-volume']).toContain('final volume of the stain')
    expect(FIELD_GUIDANCE['dilution-factor']).toContain('final volume divided by stock volume')
  })
})
