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
 * Which panel each field belongs to.
 *
 * One table, read by three things that must not disagree: the per-panel
 * "retained" badge on a collapsed panel, the "Confirm these values" control
 * in the panel header, and the explanation line that appears on the first
 * panel still carrying anything retained. Written here rather than inline in
 * the component so a field cannot be confirmable in one place and not in
 * another.
 */
export const PANEL_FIELDS: Readonly<Record<number, readonly RetainableField[]>> = {
  1: ['stockConcentration', 'stockSource', 'stockMassBasis'],
  2: ['vendorBasis', 'vendorAmount', 'vendorTestVolume', 'vendorCellNumber'],
  3: ['stainingVolume', 'cellNumber', 'pipettingMinimum'],
  4: ['topPoint', 'dilutionFactor', 'points'],
}

/**
 * Which fields the user has actively stood behind, either by editing them or
 * by confirming the panel they sit in.
 *
 * SEPARATE FROM, AND PERSISTED ALONGSIDE, THE FORM, which is the whole point.
 * Retention used to be recomputed on every load purely from which fields came
 * back holding a value, so a value the user had already confirmed came back
 * marked "carried over from your last visit" on the very next reload. That is
 * a false positive of exactly the kind C4-ST-03's marker exists to avoid: a
 * badge that appears when nothing is wrong teaches the reader to stop reading
 * it, which costs the badge its meaning in the case that matters.
 */
export type ConfirmedFields = Readonly<Record<RetainableField, boolean>>

export const NOTHING_CONFIRMED: ConfirmedFields = NOTHING_RETAINED

/**
 * Which fields a restored document came back actually HOLDING a value in.
 *
 * Only fields that hold something. A field that came back empty was not
 * carried, so marking it would be a claim about nothing.
 */
export function heldOnRestore(held: Partial<Record<RetainableField, boolean>>): RetainedFields {
  return Object.fromEntries(
    RETAINABLE_FIELDS.map((field) => [field, held[field] === true]),
  ) as RetainedFields
}

/**
 * The marks actually shown: held from a previous visit AND not yet confirmed.
 *
 * Derived rather than stored, so the two can never drift apart. Confirming a
 * field and editing a field both reduce to the same operation on `confirmed`,
 * and both therefore clear the mark everywhere it appears at once: the field
 * label, the collapsed panel summary, the declaration line in the results
 * rail, the structured object and the notebook copy.
 */
export function retainedMarks(held: RetainedFields, confirmed: ConfirmedFields): RetainedFields {
  return Object.fromEntries(
    RETAINABLE_FIELDS.map((field) => [field, held[field] && !confirmed[field]]),
  ) as RetainedFields
}

/**
 * The confirmed set after the user stands behind some fields.
 *
 * Called with one field when that field is edited, and with a panel's whole
 * field list when its "Confirm these values" control is used. Editing counts
 * as confirming deliberately: a value typed in this session must not come
 * back marked as carried over from the last one.
 */
export function confirmFields(
  confirmed: ConfirmedFields,
  fields: readonly RetainableField[],
): ConfirmedFields {
  if (fields.every((field) => confirmed[field])) return confirmed
  const next = { ...confirmed }
  for (const field of fields) next[field] = true
  return next
}

/** Whether anything at all is still showing as carried. */
export function anyRetained(retained: RetainedFields): boolean {
  return RETAINABLE_FIELDS.some((field) => retained[field])
}

/** The confirmed set as it is persisted: the field names, as an array. */
export function confirmedToList(confirmed: ConfirmedFields): RetainableField[] {
  return RETAINABLE_FIELDS.filter((field) => confirmed[field])
}

/** The persisted array back to a set, ignoring anything not a known field. */
export function confirmedFromList(stored: unknown): ConfirmedFields {
  if (!Array.isArray(stored)) return NOTHING_CONFIRMED
  const held: Partial<Record<RetainableField, boolean>> = {}
  for (const entry of stored) {
    if (typeof entry === 'string' && (RETAINABLE_FIELDS as readonly string[]).includes(entry)) {
      held[entry as RetainableField] = true
    }
  }
  return heldOnRestore(held)
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

/**
 * The stored document, and the one shape this tool writes.
 *
 * `confirmed` sits BESIDE the form rather than inside it, because
 * `restoreInputs` below discards any key the defaults do not have: a
 * confirmation list smuggled onto the flat form object would be dropped on
 * every read, silently, and the feature would appear to work while losing
 * every confirmation at the moment it was supposed to survive one.
 */
export interface StoredDocument<T> {
  form: T
  confirmed: RetainableField[]
}

/**
 * A stored payload split back into its two parts, tolerating the older shape.
 *
 * Documents written before confirmation existed are the bare form object,
 * with no `form` property of their own. Those restore with nothing confirmed,
 * which is the fail-safe direction: every held value is marked as carried
 * over, and the reader is asked to confirm declarations they may well have
 * already confirmed, rather than being shown unmarked a value they have not.
 *
 * Deliberately NOT a new storage key. `check-network.mjs` fails the build
 * unless every key the page writes is disclosed verbatim on the page, and a
 * rename would strand every `c4.state.v1` already in a reader's browser as an
 * undisclosed orphan this code can no longer reach to remove.
 */
export function splitStored(stored: unknown): { form: unknown; confirmed: ConfirmedFields } {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return { form: stored, confirmed: NOTHING_CONFIRMED }
  }
  const source = stored as Record<string, unknown>
  if (!('form' in source)) return { form: stored, confirmed: NOTHING_CONFIRMED }
  return { form: source.form, confirmed: confirmedFromList(source.confirmed) }
}

/**
 * Shown beside any field whose value came back from storage. C4-ST-03.
 *
 * "from your last visit" rather than "retained", which needed a glossary the
 * page did not have: a reader met eleven unexplained badges and had no way to
 * find out what they were being told. The machine-readable name stays
 * `retained` in the structured object; only what a human reads changed.
 */
export const RETAINED_MARKER_LABEL = 'from your last visit'
export const RETAINED_MARKER_TOOLTIP =
  'This value was carried over from your last visit to this page, not entered now. Confirm it or ' +
  'change it. Until you do, the output and the notebook copy will record that it was carried over.'

/** Shown once, on the first panel still carrying anything from a last visit. */
export const RETENTION_PANEL_NOTE =
  'Values marked "from your last visit" were carried over from the last time you used this page. ' +
  'Confirm each one before you record the series.'

/**
 * What "Confirm these values" is about to do, said plainly.
 *
 * The control accepts whatever the panel currently holds, INCLUDING anything
 * the tool filled in that the reader has not looked at. That is the whole
 * risk: a stock concentration entered in µg/mL against a unit still sitting
 * on the mg/mL suggestion is out by a thousand, and a confirmation that
 * quietly swept it up would have recorded the tool's guess as the reader's
 * own declaration on the output and in the notebook copy.
 */
export const CONFIRM_TOOLTIP =
  'Records these values as your own choice, including any the tool suggested and you have not ' +
  'changed. The output stops marking them as carried over or suggested.'

/** The button's label where a value the TOOL chose is among what it accepts. */
export const CONFIRM_LABEL_DEFAULT = 'Confirm these values'
export const CONFIRM_LABEL_SUGGESTED_UNIT = 'Confirm the suggested unit'
export const CONFIRM_LABEL_SUGGESTED_VALUES = 'Confirm the suggested values'

/** Shown beside a value the tool filled in rather than the reader choosing. */
export const SUGGESTION_MARKER_LABEL = 'suggested, not chosen'
export const SUGGESTION_MARKER_TOOLTIP =
  'This value was filled in by the tool as a starting point, not chosen by you. Change it or leave ' +
  'it. The output records which of the two it was.'

export const RETENTION_STATEMENT =
  'Values marked "from your last visit" were carried over from your last visit to this page rather ' +
  'than entered now. Confirm each one before recording the series: a declaration made under ' +
  'different conditions is the failure this tool exists to prevent. Confirming is recorded and ' +
  'survives a reload, so a value you have stood behind is not marked again next time.'
