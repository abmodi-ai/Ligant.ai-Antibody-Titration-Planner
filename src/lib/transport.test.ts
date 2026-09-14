import { describe, expect, it } from 'vitest'
import { canonicalise, checksum, decodeEnvelope, encodeEnvelope } from './transport'

/**
 * Acceptance 20, C4-ST-07 and C4-FX-21.
 *
 * An imported object with a flag removed or a field truncated is detected and
 * rejected, with a message naming the failure.
 *
 * AND THE LIMIT OF THAT CLAIM IS TESTED TOO. C4-ST-07 is scoped to integrity
 * rather than authenticity, and a test suite that only demonstrated detection
 * would leave the impression that the check is stronger than it is. The last
 * group below demonstrates the case it CANNOT catch, so the scope statement on
 * the page is backed by an executed test rather than by a disclaimer.
 */

const C1_OBJECT = {
  schema: { name: 'ligant-benchtools-c1-conversion', version: '1.4.0' },
  tool: { id: 'C1', name: 'Molarity Converter for Biologics', engineVersion: 'v0.1.0' },
  quantities: {
    molecularWeight: { value: 150_000, unit: 'g/mol', underflowed: false },
  },
  declarations: {
    molecularWeightProvenance: 'certificate-of-analysis',
    massBasis: 'conjugate',
  },
  flags: [
    {
      code: 'C1-FL-08',
      message: 'Molecular weight includes label or payload.',
      evaluatedOn: 'mass-basis declaration',
      kind: 'declaration',
    },
  ],
}

describe('the canonical form', () => {
  it('does not depend on the order a producer built its object in', () => {
    // Otherwise a round trip through any JSON library would look like damage.
    const a = { b: 1, a: { d: 2, c: 3 } }
    const b = { a: { c: 3, d: 2 }, b: 1 }
    expect(canonicalise(a)).toBe(canonicalise(b))
    expect(checksum(a)).toBe(checksum(b))
  })

  it('does depend on the order of an array, because in a series order is data', () => {
    expect(checksum({ points: [1, 2, 3] })).not.toBe(checksum({ points: [3, 2, 1] }))
  })
})

describe('C4-FX-21(a), a flagged object arriving intact', () => {
  it('is accepted, with its flag still attached', () => {
    const encoded = encodeEnvelope('c1-conversion', C1_OBJECT)
    const outcome = decodeEnvelope<typeof C1_OBJECT>(encoded, 'c1-conversion')
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.payload.flags).toHaveLength(1)
      expect(outcome.payload.flags[0].code).toBe('C1-FL-08')
    }
  })

  it('survives a round trip through JSON without being read as damaged', () => {
    const encoded = encodeEnvelope('c1-conversion', JSON.parse(JSON.stringify(C1_OBJECT)))
    expect(decodeEnvelope(encoded, 'c1-conversion').ok).toBe(true)
  })
})

describe('C4-FX-21(b), the same object with a flag removed by hand', () => {
  it('is detected and rejected, naming the failure', () => {
    const encoded = encodeEnvelope('c1-conversion', C1_OBJECT)
    // Edit the payload in place, as someone deleting a line would.
    const envelope = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
    envelope.payload.flags = []
    const tampered = btoa(JSON.stringify(envelope)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const outcome = decodeEnvelope(tampered, 'c1-conversion')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.rejection.failure).toBe('checksum-mismatch')
      expect(outcome.rejection.message).toMatch(/had fields removed/)
      expect(outcome.rejection.message).toMatch(/has not been used/)
    }
  })

  it('is rejected when the whole flag list is absent rather than emptied', () => {
    // A separate check from the checksum, and it has to be. An object built
    // WITHOUT a flag list passes its own checksum, because the producer
    // checksummed what it built. C4-ST-01 forbids accepting that as much as it
    // forbids accepting a truncation, and only an explicit check catches it.
    const withoutFlags = { ...C1_OBJECT, flags: undefined }
    const encoded = encodeEnvelope('c1-conversion', withoutFlags)
    const outcome = decodeEnvelope(encoded, 'c1-conversion')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.rejection.failure).toBe('flags-missing')
      expect(outcome.rejection.message).toMatch(/An absent list is not the same as an empty one/)
    }
  })

  it('accepts an object whose flag list is genuinely empty', () => {
    // No flags raised is a real and common outcome, and is not the same as a
    // flag list that went missing.
    const clean = { ...C1_OBJECT, flags: [] }
    expect(decodeEnvelope(encodeEnvelope('c1-conversion', clean), 'c1-conversion').ok).toBe(true)
  })
})

describe('C4-FX-21(c), the same object truncated', () => {
  it.each([0.9, 0.5, 0.25] as const)('is detected when cut to %s of its length', (fraction) => {
    const encoded = encodeEnvelope('c1-conversion', C1_OBJECT)
    const truncated = encoded.slice(0, Math.floor(encoded.length * fraction))
    const outcome = decodeEnvelope(truncated, 'c1-conversion')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      // Truncation usually destroys the JSON before it reaches the checksum.
      expect(['not-decodable', 'not-an-envelope', 'checksum-mismatch']).toContain(
        outcome.rejection.failure,
      )
      expect(outcome.rejection.message.length).toBeGreaterThan(0)
    }
  })
})

describe('the other ways an envelope can fail', () => {
  it('rejects something that is not an envelope at all', () => {
    const notAnEnvelope = btoa('{"hello":"world"}').replace(/=+$/, '')
    const outcome = decodeEnvelope(notAnEnvelope, 'c1-conversion')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.rejection.failure).toBe('not-an-envelope')
  })

  it('rejects an envelope of the wrong kind', () => {
    const series = encodeEnvelope('c4-series', { flags: [] })
    const outcome = decodeEnvelope(series, 'c1-conversion')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.rejection.failure).toBe('wrong-kind')
  })

  it('rejects a transport version it does not read', () => {
    const envelope = { v: 2, kind: 'c1-conversion', payload: C1_OBJECT, checksum: checksum(C1_OBJECT) }
    const encoded = btoa(JSON.stringify(envelope)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const outcome = decodeEnvelope(encoded, 'c1-conversion')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.rejection.failure).toBe('unsupported-version')
  })

  it('detects a single altered digit in the molecular weight', () => {
    const encoded = encodeEnvelope('c1-conversion', C1_OBJECT)
    const envelope = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
    envelope.payload.quantities.molecularWeight.value = 150_001
    const tampered = btoa(JSON.stringify(envelope)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const outcome = decodeEnvelope(tampered, 'c1-conversion')
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.rejection.failure).toBe('checksum-mismatch')
  })
})

/**
 * The limit of the claim, demonstrated rather than disclaimed.
 *
 * C4-ST-07's own note says a client-side check cannot prevent deliberate
 * editing followed by recomputation, and that the tool shall not state or imply
 * that it does. This test is what makes that statement true of the shipped
 * code: the object is edited, the checksum recomputed, and the result is
 * accepted. Anyone reading the suite to find out what the check is worth finds
 * this beside the tests above rather than having to infer it.
 */
describe('what the integrity check cannot do, demonstrated', () => {
  it('accepts an object edited by someone who recomputed the checksum', () => {
    const stripped = { ...C1_OBJECT, flags: [] }
    const forged = encodeEnvelope('c1-conversion', stripped)
    const outcome = decodeEnvelope<typeof stripped>(forged, 'c1-conversion')

    // Accepted. There is no server and no secret, so there is nothing an
    // editor cannot reproduce. This is an integrity check, not an authenticity
    // check, and the page says so where the import is offered.
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.payload.flags).toHaveLength(0)
  })
})
