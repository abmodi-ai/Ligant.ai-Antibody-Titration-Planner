/**
 * C4-ST-03 and C4-ST-04: what is carried across a reload, and what is marked as
 * carried.
 *
 * "No input shall persist across a page reload unless its persistence is
 * visible on screen." That is a stronger rule than the one the Antigen Density
 * Calculator implements, and this is where the two tools deliberately part
 * company. The ADC restores its settings silently, which is reasonable for a
 * tool whose stored state is a table the user is looking at. C4's stored state
 * is a set of DECLARATIONS, and a declaration a user did not make in this
 * session, presented as though they had, is exactly the failure the whole tool
 * exists to prevent: a number carried across a change of context with the
 * context left behind.
 *
 * So nothing is restored unmarked. Every field that came back from storage
 * renders a visible "retained" marker until the user touches it.
 *
 * THE MODEL IS PER FIELD, and that is the part a single boolean gets wrong. C1
 * found this the hard way: retention held as one flag for the whole form
 * satisfies the requirement at the moment of the restore and breaks one
 * keystroke later, because editing any field cleared the badge from every other
 * field, which were still carrying their restored values and were now unmarked.
 * Two rules follow, and the second is the one the boolean got wrong:
 *
 *   1. A field is marked as retained only if it actually HOLDS a value. An
 *      empty select is not a retained value, and badging it teaches the user
 *      that the badge means nothing.
 *   2. A field stops being marked when THAT field is edited, and not when some
 *      other field is. Confirming the staining volume says nothing about the
 *      stock.
 *
 * Kept out of the component and expressed as data, so it can be tested without
 * a DOM. The wiring itself is checked in the browser, by check-network.mjs.
 */

/**
 * The fields C4-ST-03 covers: every declaration, and every part of the series
 * design. The derived anchor concentration is not among them, because it is not
 * an input and is recomputed on every render (C4-SR-01).
 */
export type RetainableField =
  | 'stockConcentration'
  | 'stockSource'
  | 'stockMassBasis'
  | 'vendorBasis'
  | 'vendorAmount'
  | 'vendorTestVolume'
  | 'vendorCellNumber'
  | 'stainingVolume'
  | 'cellNumber'
  | 'pipettingMinimum'
  | 'topPoint'
  | 'dilutionFactor'
  | 'points'

export const RETAINABLE_FIELDS: readonly RetainableField[] = [
  'stockConcentration',
  'stockSource',
  'stockMassBasis',
  'vendorBasis',
  'vendorAmount',
  'vendorTestVolume',
  'vendorCellNumber',
  'stainingVolume',
  'cellNumber',
  'pipettingMinimum',
  'topPoint',
  'dilutionFactor',
  'points',
]

export type RetainedFields = Readonly<Record<RetainableField, boolean>>

/** The ordinary case: a session that began with an empty form. */
export const NOTHING_RETAINED: RetainedFields = Object.freeze(
  Object.fromEntries(RETAINABLE_FIELDS.map((f) => [f, false])) as Record<RetainableField, boolean>,
)

/**
 * The set to mark as retained when a stored document is restored.
 *
 * Only fields that hold a value. A field that came back empty was not carried,
 * so marking it would be a claim about nothing.
 */
export function retainedOnRestore(held: Partial<Record<RetainableField, boolean>>): RetainedFields {
  return Object.fromEntries(
    RETAINABLE_FIELDS.map((field) => [field, held[field] === true]),
  ) as RetainedFields
}

/** The set after the user edits one field. Removes exactly that field. */
export function confirmField(retained: RetainedFields, field: RetainableField): RetainedFields {
  if (!retained[field]) return retained
  return { ...retained, [field]: false }
}

/** Whether anything at all is still showing as carried. */
export function anyRetained(retained: RetainedFields): boolean {
  return RETAINABLE_FIELDS.some((field) => retained[field])
}

/**
 * The key this tool writes, and the only one.
 *
 * check-network.mjs reads every storage key the page writes and fails the build
 * unless each appears verbatim inside a `code` element on the page. A key that
 * is written but not disclosed is the defect that check exists to catch.
 */
export const STORAGE_KEY = 'c4.state.v1'

/**
 * Write a document, or remove the key when there is nothing to write.
 *
 * The rule is that storage mirrors work in progress: no work, no key. It also
 * means a visitor who reads the page and types nothing leaves with nothing
 * written, which is the behaviour the privacy disclosure implies. "Clear stored
 * data" removes the key, and resetting the form must not then write it straight
 * back holding an empty document, or a reader who checks afterwards finds the
 * key still there, which is not what the button says.
 */
export function persist(key: string, value: unknown, hasContent: boolean): void {
  try {
    if (hasContent) localStorage.setItem(key, JSON.stringify(value))
    else localStorage.removeItem(key)
  } catch {
    // Storage unavailable, in a private window or with site data blocked. The
    // tool remains fully functional without it.
  }
}

/**
 * Settings restored from storage, backfilled from `defaults`.
 *
 * Every key comes from `defaults`. A stored key is used only where it is
 * present and matches the default's type; anything else, including a key the
 * stored payload has and the defaults do not, is discarded. Deliberately strict
 * rather than a spread: a spread trusts the stored payload, and a value of the
 * wrong type reaching a control renders it uncontrolled, so the interface shows
 * a legitimate choice while the logic reads nothing.
 */
export function restoreInputs<T extends object>(stored: unknown, defaults: T): T {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return { ...defaults }
  }

  const source = stored as Record<string, unknown>
  const fallback = defaults as Record<string, unknown>
  const restored: Record<string, unknown> = { ...fallback }

  for (const key of Object.keys(fallback)) {
    const value = source[key]
    if (value === undefined || value === null) continue
    if (typeof value !== typeof fallback[key]) continue
    // A persisted NaN or Infinity would propagate into every derived figure.
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    restored[key] = value
  }

  return restored as T
}

/** Shown beside any field whose value came back from storage. C4-ST-03. */
export const RETAINED_MARKER_LABEL = 'retained'
export const RETENTION_STATEMENT =
  'Values marked as retained were carried over from your last visit to this page rather than ' +
  'entered now. Confirm each one before recording the series: a declaration made under different ' +
  'conditions is the failure this tool exists to prevent.'
