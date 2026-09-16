import { describe, expect, it } from 'vitest'
import {
  NOTHING_CONFIRMED,
  PANEL_FIELDS,
  RETAINABLE_FIELDS,
  anyRetained,
  confirmFields,
  confirmedFromList,
  confirmedToList,
  heldOnRestore,
  retainedMarks,
  splitStored,
} from './retention'

/**
 * C4-ST-03, C4-NF-07, and the confirmation half added after the second
 * review: a value carried over from a previous visit is marked until the
 * reader stands behind it, and standing behind it has to survive a reload or
 * the mark is back tomorrow saying something that is no longer true.
 */

describe('retainedMarks', () => {
  it('marks a held field that has not been confirmed', () => {
    const held = heldOnRestore({ stainingVolume: true })
    expect(retainedMarks(held, NOTHING_CONFIRMED).stainingVolume).toBe(true)
  })

  it('does not mark a field that was never held, however much it is confirmed', () => {
    const held = heldOnRestore({})
    const confirmed = confirmFields(NOTHING_CONFIRMED, ['stainingVolume'])
    expect(retainedMarks(held, confirmed).stainingVolume).toBe(false)
  })

  it('clears the mark for exactly the confirmed field and no other', () => {
    const held = heldOnRestore({ stainingVolume: true, cellNumber: true })
    const confirmed = confirmFields(NOTHING_CONFIRMED, ['stainingVolume'])
    const marks = retainedMarks(held, confirmed)
    expect(marks.stainingVolume).toBe(false)
    // C1 got this wrong with a single boolean for the whole form: confirming
    // one field cleared the badge from every other field, which were still
    // carrying restored values and were now unmarked.
    expect(marks.cellNumber).toBe(true)
  })

  it('clears a whole panel at once, and only that panel', () => {
    const held = heldOnRestore(
      Object.fromEntries(RETAINABLE_FIELDS.map((f) => [f, true])) as Record<string, boolean>,
    )
    const confirmed = confirmFields(NOTHING_CONFIRMED, PANEL_FIELDS[3])
    const marks = retainedMarks(held, confirmed)
    for (const field of PANEL_FIELDS[3]) expect(marks[field]).toBe(false)
    for (const field of PANEL_FIELDS[1]) expect(marks[field]).toBe(true)
    expect(anyRetained(marks)).toBe(true)
  })
})

describe('confirmFields', () => {
  it('returns the same object when nothing changes, so React can skip the render', () => {
    const confirmed = confirmFields(NOTHING_CONFIRMED, ['points'])
    expect(confirmFields(confirmed, ['points'])).toBe(confirmed)
  })
})

describe('confirmation survives a round trip through storage', () => {
  it('T10: a field confirmed in one session is not marked in the next', () => {
    // Session one: the value came back from storage, and the reader
    // confirmed it.
    const held = heldOnRestore({ stainingVolume: true, cellNumber: true })
    const confirmed = confirmFields(NOTHING_CONFIRMED, ['stainingVolume'])
    expect(retainedMarks(held, confirmed).stainingVolume).toBe(false)

    // Written, read back, session two. The value is still held, because it
    // is still in the form; what must not come back is the mark.
    const written = JSON.stringify({ form: {}, confirmed: confirmedToList(confirmed) })
    const { confirmed: restored } = splitStored(JSON.parse(written))
    const marks = retainedMarks(held, restored)
    expect(marks.stainingVolume).toBe(false)
    // And the one that was never confirmed is still marked, so the round
    // trip has not simply cleared everything.
    expect(marks.cellNumber).toBe(true)
  })

  it('reads a document written before confirmation existed, with nothing confirmed', () => {
    // The old shape is the bare form object, with no `form` property of its
    // own. It must restore as a form, not be mistaken for the new wrapper.
    const legacy = { stainingVolume: '100', cellNumber: '1' }
    const { form, confirmed } = splitStored(legacy)
    expect(form).toEqual(legacy)
    expect(confirmedToList(confirmed)).toEqual([])
  })

  it('discards a confirmation naming something that is not a field', () => {
    const { confirmed } = splitStored({ form: {}, confirmed: ['stainingVolume', 'nonsense', 7] })
    expect(confirmedToList(confirmed)).toEqual(['stainingVolume'])
  })

  it('treats a missing or malformed confirmation list as nothing confirmed', () => {
    expect(confirmedToList(confirmedFromList(undefined))).toEqual([])
    expect(confirmedToList(confirmedFromList('stainingVolume'))).toEqual([])
    expect(confirmedToList(splitStored({ form: {} }).confirmed)).toEqual([])
  })
})

describe('PANEL_FIELDS', () => {
  it('covers every retainable field exactly once', () => {
    const listed = [1, 2, 3, 4].flatMap((step) => PANEL_FIELDS[step])
    expect([...listed].sort()).toEqual([...RETAINABLE_FIELDS].sort())
  })
})
