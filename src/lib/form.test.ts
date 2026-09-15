import { describe, expect, it } from 'vitest'
import { EMPTY_FORM, reconcileTopPoint, type FormState } from './form'

/**
 * C4-ST-04, reproduced against the build: enter a stock concentration, enter
 * the top point as a concentration (form 3), then switch the stock to "not
 * stated by vendor". Form 3 needs a stock concentration to resolve to a stock
 * volume and no longer has one. `reconcileTopPoint` is the single place both
 * the interactive stock-kind change and a restore from storage go through, so
 * the `<select>` and the state it reads from cannot diverge, and the fixture
 * below is the case that diverged before this function existed: the select
 * would show its first remaining option, form 1, while `topForm` still held
 * 3, and the series went on to reject under the wrong code because the
 * volume anchor silently returned null for a form it does not accept.
 */
describe('reconcileTopPoint', () => {
  const form = (patch: Partial<FormState>): FormState => ({ ...EMPTY_FORM, ...patch })

  it('clears the top point when its form stops being computable for the stock', () => {
    const stale = form({ stockKind: 'not-stated-by-vendor', topForm: '3', topValue: '5' })
    const { form: reconciled, invalidated } = reconcileTopPoint(stale)
    expect(invalidated).toBe(true)
    // D3: cleared to '', not silently relabelled to another form (form 1
    // before Nadira's second review). A discarded form is not the same
    // property as a form the tool picked on the user's behalf.
    expect(reconciled.topForm).toBe('')
    expect(reconciled.topValue).toBe('')
    // Everything else about the form is untouched.
    expect(reconciled.stockKind).toBe('not-stated-by-vendor')
  })

  it('leaves the top point alone when its form is still valid for the stock', () => {
    const stated = form({ stockKind: 'stated', topForm: '3', topValue: '5' })
    const { form: reconciled, invalidated } = reconcileTopPoint(stated)
    expect(invalidated).toBe(false)
    expect(reconciled).toBe(stated)
  })

  it('leaves an unset top point unset, and not invalidated', () => {
    const empty = form({ stockKind: 'not-stated-by-vendor' })
    const { form: reconciled, invalidated } = reconcileTopPoint(empty)
    expect(invalidated).toBe(false)
    expect(reconciled.topForm).toBe('')
  })

  it('accepts forms 1 and 4 regardless of the stock declaration', () => {
    for (const topForm of ['1', '4'] as const) {
      const stale = form({ stockKind: 'not-stated-by-vendor', topForm, topValue: '3' })
      expect(reconcileTopPoint(stale).invalidated).toBe(false)
    }
  })

  it('leaves forms 2, 3 and 5 alone when the stock is stated', () => {
    for (const topForm of ['2', '3', '5'] as const) {
      const stated = form({ stockKind: 'stated', topForm, topValue: '3' })
      expect(reconcileTopPoint(stated).invalidated).toBe(false)
    }
  })
})
