/**
 * C4-ST-06 and C4-ST-07: how a result object reaches this tool, and how it is
 * checked on arrival.
 *
 * THE MECHANISM. A result object travels in the URL FRAGMENT, base64url encoded
 * inside a small envelope. The fragment is the only part of a URL that a
 * browser never transmits: it is not sent in the request line, it does not
 * reach a server log, a referer header or a proxy. That is what satisfies
 * C4-ST-06's "no server and no persistence" without anything having to be
 * trusted to honour it. The same mechanism carries a series from this tool to
 * C3, in the other direction, which is the other half of C4-ST-06.
 *
 * The C1-side change this requires is recorded in
 * docs/open-item-09-transport-and-integrity.md: C1 has no export today, and
 * gains one that writes this envelope.
 *
 * THE CHECK IS INTEGRITY, NOT AUTHENTICITY, and the distinction is stated on
 * the page as well as here. A checksum over the canonical form detects an
 * object that arrived corrupted, truncated, or with fields removed, which is
 * the failure C4-ST-01 exists to prevent: a flagged molecular weight whose flag
 * fell off on the way. It does NOT detect an adversary. Anyone who edits the
 * object deliberately can recompute the checksum, because there is no server
 * and no secret, and a client-side tool that claimed otherwise would be
 * claiming something it cannot do. C4-ST-07's own note says so in terms, and
 * the tool must not state or imply a guarantee it cannot make.
 *
 * WHY NOT A CRYPTOGRAPHIC HASH. `crypto.subtle` is asynchronous, which would
 * make every consumer of this module asynchronous, and it would buy nothing:
 * against accidental corruption FNV-1a is sufficient, and against a deliberate
 * edit SHA-256 is no better here, since the attacker recomputes it just as
 * easily. Choosing the stronger primitive would have made the claim look
 * stronger without making it stronger, which is the failure mode this
 * requirement was narrowed to avoid.
 */

/** The offset basis and prime of FNV-1a, 64-bit. */
const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn

/**
 * A canonical JSON serialisation: keys sorted at every depth.
 *
 * The checksum must not depend on the order a producer happened to build its
 * object in, or a round trip through any JSON library would look like
 * corruption. Arrays keep their order, because in a series the order IS data.
 */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`
}

/** FNV-1a over the UTF-8 bytes of the canonical form, as 16 hex digits. */
export function checksum(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalise(value))
  let hash = FNV_OFFSET
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64
  }
  return hash.toString(16).padStart(16, '0')
}

export type EnvelopeKind = 'c1-conversion' | 'c4-series'

export interface Envelope<T = unknown> {
  /** The envelope format's own version, not the payload's. */
  v: 1
  kind: EnvelopeKind
  payload: T
  /** FNV-1a over the canonical payload. Integrity only. See the file header. */
  checksum: string
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Wrap a payload for transport, and encode it for a URL fragment. */
export function encodeEnvelope<T>(kind: EnvelopeKind, payload: T): string {
  const envelope: Envelope<T> = { v: 1, kind, payload, checksum: checksum(payload) }
  return toBase64Url(JSON.stringify(envelope))
}

export type TransportFailure =
  | 'not-decodable'
  | 'not-an-envelope'
  | 'unsupported-version'
  | 'wrong-kind'
  | 'checksum-mismatch'
  | 'flags-missing'

export interface TransportRejection {
  failure: TransportFailure
  /** C4-ST-07: the message names the failure. */
  message: string
}

export type DecodeOutcome<T> = { ok: true; payload: T } | { ok: false; rejection: TransportRejection }

const MESSAGES: Readonly<Record<TransportFailure, string>> = {
  'not-decodable':
    'The imported object could not be decoded. The link is incomplete or was altered in transit; ask for it again rather than repairing it by hand.',
  'not-an-envelope':
    'The imported data is not a result object from this tool set. It carries no envelope, so there is nothing to check it against.',
  'unsupported-version':
    'The imported object uses a transport version this tool does not read. The tool that produced it is newer than this one.',
  'wrong-kind':
    'The imported object is not of the kind this tool expected. A molecular weight was expected and something else arrived.',
  'checksum-mismatch':
    'The imported object failed its integrity check: it was truncated, corrupted, or had fields removed after it was produced. It has not been used. This check detects accidental damage; it cannot detect a deliberate edit, because anyone editing the object can recompute the check.',
  'flags-missing':
    'The imported object carries no flag list at all. An absent list is not the same as an empty one, and a value that arrived stripped of what qualifies it cannot be accepted.',
}

/**
 * Decode and check an envelope from a URL fragment.
 *
 * The order of the checks is the order in which each becomes answerable, and
 * the flag check is LAST and SEPARATE from the checksum deliberately. A
 * truncation that removed the flags fails the checksum; an object built without
 * a flag list at all passes it, because the producer checksummed what it built.
 * C4-ST-01 forbids accepting the second as much as the first, and only an
 * explicit check catches it.
 */
export function decodeEnvelope<T = unknown>(
  encoded: string,
  expected: EnvelopeKind,
  requireFlags = true,
): DecodeOutcome<T> {
  const reject = (failure: TransportFailure): DecodeOutcome<T> => ({
    ok: false,
    rejection: { failure, message: MESSAGES[failure] },
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(encoded))
  } catch {
    return reject('not-decodable')
  }

  if (typeof parsed !== 'object' || parsed === null) return reject('not-an-envelope')
  const envelope = parsed as Partial<Envelope<T>>
  if (typeof envelope.checksum !== 'string' || envelope.payload === undefined) {
    return reject('not-an-envelope')
  }
  if (envelope.v !== 1) return reject('unsupported-version')
  if (envelope.kind !== expected) return reject('wrong-kind')
  if (checksum(envelope.payload) !== envelope.checksum) return reject('checksum-mismatch')

  if (requireFlags) {
    const payload = envelope.payload as { flags?: unknown }
    if (!Array.isArray(payload?.flags)) return reject('flags-missing')
  }

  return { ok: true, payload: envelope.payload as T }
}

/** Stated on the page wherever the import is offered. C4-ST-07's note. */
export const INTEGRITY_SCOPE_STATEMENT =
  'An imported object carries a check that detects accidental corruption, truncation, or removal ' +
  'of fields including its flags. This is an integrity check and not an authenticity check: it ' +
  'cannot detect a deliberate edit, because there is no server and no secret, and anyone who ' +
  'edits the object can recompute the check. This tool does not claim otherwise.'
