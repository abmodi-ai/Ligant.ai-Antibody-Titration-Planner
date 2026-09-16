import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Masthead } from './components/shared/Masthead'
import { SiteFooter } from './components/shared/SiteFooter'
import { SkipLink } from './components/shared/SkipLink'
import { FlagList, FlagSummaryList, RejectionList } from './components/shared/FlagList'
import { LigantMark } from './components/LigantMark'
import { DeclarationPanel } from './components/DeclarationPanel'
import { Method } from './components/Method'
import { SeriesTable, notebookLine, vendorBasisSummary } from './components/SeriesTable'
import { computeSeries, type Outcome } from './lib/compute'
import {
  EMPTY_FORM,
  hasContent,
  missingDeclarations,
  panelCompletion,
  reconcileTopPoint,
  toSeriesInputs,
  type FormState,
} from './lib/form'
import { formatSigFigs } from './lib/format'
import { SCOPE_STATEMENT } from './lib/flags'
import {
  MAX_POINTS,
  MIN_POINTS,
  acceptedTopPointForms,
  type ImportedMolecularWeight,
} from './lib/normalise'
import {
  NOTHING_CONFIRMED,
  NOTHING_RETAINED,
  PANEL_FIELDS,
  RETAINABLE_FIELDS,
  RETAINED_MARKER_LABEL,
  RETAINED_MARKER_TOOLTIP,
  RETENTION_PANEL_NOTE,
  STORAGE_KEY,
  SUGGESTION_MARKER_LABEL,
  SUGGESTION_MARKER_TOOLTIP,
  confirmFields,
  confirmedToList,
  heldOnRestore,
  persist,
  restoreInputs,
  retainedMarks,
  splitStored,
  type ConfirmedFields,
  type RetainableField,
  type RetainedFields,
} from './lib/retention'
import { FieldHelp, FieldHelpProvider } from './components/shared/FieldHelp'
import { decodeEnvelope } from './lib/transport'
import { toJson } from './lib/serialise'
import { APP_VERSION, TOOL_NAME } from './lib/site'
import {
  CELL_UNITS,
  CONCENTRATION_UNITS,
  IMPORTED_MASS_BASIS_LABEL,
  STOCK_MASS_BASES,
  STOCK_MASS_BASIS_LABEL,
  STOCK_MASS_BASIS_SHORT,
  STOCK_SOURCES,
  STOCK_SOURCE_LABEL,
  UNIT_LABEL,
  VENDOR_BASES,
  VENDOR_BASIS_LABEL,
  VOLUME_UNITS,
  formatCellCount,
  type CellUnit,
  type ConcentrationUnit,
  type VolumeUnit,
} from './lib/units'
import type { TopPointForm } from './lib/normalise'

/**
 * The top-point form select's options, in display order.
 *
 * Filtered by `acceptedTopPointForms` rather than duplicating its gate: this
 * is the second place the accepted set was previously reimplemented inline,
 * and the divergence between this list and `reconcileTopPoint`'s own check is
 * what let the select go out of sync with the state under C4-ST-04.
 */
const TOP_FORM_OPTIONS: readonly { form: TopPointForm; label: string }[] = [
  { form: 1, label: 'volume of stock per test, µL' },
  { form: 2, label: 'mass per test, µg' },
  { form: 3, label: 'concentration in the stain, µg/mL' },
  { form: 5, label: 'mass per 10⁶ cells, µg' },
  { form: 4, label: 'dilution factor from stock' },
]

/**
 * Which form field, if any, corresponds to each persisted key.
 *
 * The retention marker is per field (C4-ST-03), so a restore has to know which
 * fields actually came back holding something.
 */
const FIELD_OF: Partial<Record<keyof FormState, RetainableField>> = {
  stockValue: 'stockConcentration',
  stockSource: 'stockSource',
  stockMassBasis: 'stockMassBasis',
  vendorBasis: 'vendorBasis',
  vendorAmountValue: 'vendorAmount',
  vendorTestVolume: 'vendorTestVolume',
  vendorCells: 'vendorCellNumber',
  stainingVolume: 'stainingVolume',
  cellNumber: 'cellNumber',
  pipettingMinimum: 'pipettingMinimum',
  topValue: 'topPoint',
  dilutionFactor: 'dilutionFactor',
  points: 'points',
}

interface LoadedForm {
  form: FormState
  /** Which fields came back from storage actually holding a value. */
  held: RetainedFields
  /** Which the reader had already stood behind, in some previous session. */
  confirmed: ConfirmedFields
  topPointNeedsReentry: boolean
}

const EMPTY_LOAD: LoadedForm = {
  form: EMPTY_FORM,
  held: NOTHING_RETAINED,
  confirmed: NOTHING_CONFIRMED,
  topPointNeedsReentry: false,
}

function loadForm(): LoadedForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return EMPTY_LOAD
    const { form: storedForm, confirmed } = splitStored(JSON.parse(raw))
    const restored = restoreInputs(storedForm, EMPTY_FORM)
    const held: Partial<Record<RetainableField, boolean>> = {}
    for (const [key, field] of Object.entries(FIELD_OF) as [keyof FormState, RetainableField][]) {
      const value = restored[key]
      // Only fields that actually HOLD something are marked. Badging an empty
      // field teaches the reader that the badge means nothing.
      if (typeof value === 'string' && value.trim() !== '') held[field] = true
    }
    // C4-ST-04. A document written before this rule existed, or edited by
    // hand, can hold a topForm that no longer matches stockKind. Corrected on
    // load rather than trusted, the same as the interactive change.
    const { form: reconciled, invalidated } = reconcileTopPoint(restored)
    if (invalidated) held.topPoint = false
    return {
      form: reconciled,
      held: heldOnRestore(held),
      confirmed,
      topPointNeedsReentry: invalidated,
    }
  } catch {
    return EMPTY_LOAD
  }
}

/**
 * C4-ST-03. Shown against any field whose value was carried over.
 *
 * Carries its own explanation, because the badge that prompted this rework
 * was unexplained anywhere on the page: a reader met it eleven times over and
 * had no way to find out what they were being told.
 */
function Retained({ when, field }: { when: boolean; field: string }) {
  if (!when) return null
  return (
    <span className="retained-marker">
      {RETAINED_MARKER_LABEL}
      <FieldHelp id={`retained-${field}`} label="carried over from your last visit" text={RETAINED_MARKER_TOOLTIP} />
    </span>
  )
}

/** C4-SR-01 and C4-UN-01. Shown against a value the tool proposed. */
function Suggested({ when, field }: { when: boolean; field: string }) {
  if (!when) return null
  return (
    <span className="suggestion-marker">
      {SUGGESTION_MARKER_LABEL}
      <FieldHelp id={`suggested-${field}`} label="suggested by the tool, not chosen" text={SUGGESTION_MARKER_TOOLTIP} />
    </span>
  )
}

/**
 * C4-ST-04. Shown against the top point when its declared form stopped being
 * computable under the stock declaration and was cleared rather than
 * relabelled. Distinct from `Retained`: this field was not carried over, it
 * was emptied because what it held no longer means anything.
 */
function NeedsReentry({ when }: { when: boolean }) {
  if (!when) return null
  return <span className="reentry-marker">cleared, needs re-entry</span>
}

/**
 * What a collapsed panel shows in place of its fields.
 *
 * The declared VALUES, not a tick and not a count. A collapsed panel that said
 * only "complete" would have hidden a declaration, which is the one thing the
 * layout remedy must not do.
 */
function panelSummaries(form: FormState) {
  const unit = (u: keyof typeof UNIT_LABEL) => UNIT_LABEL[u]
  const stock =
    form.stockKind === 'stated'
      ? `${form.stockValue} ${unit(form.stockUnit)}, ${form.stockMassBasis === '' ? '' : STOCK_MASS_BASIS_SHORT[form.stockMassBasis]}`
      : 'concentration not stated by the vendor'
  const source = form.stockSource === '' ? 'not yet stated' : STOCK_SOURCE_LABEL[form.stockSource]

  let vendor = VENDOR_BASIS_LABEL[form.vendorBasis]
  if (form.vendorBasis === 'per-test-volume-stated') {
    vendor = `${form.vendorAmountValue} ${form.vendorAmountKind === 'mass' ? unit('ug') : unit(form.vendorAmountUnit)} per test at ${form.vendorTestVolume} ${unit(form.vendorTestVolumeUnit)}`
    if (form.vendorCellsKind === 'stated') vendor += `, ${formatCellCount(form.vendorCells, form.vendorCellsUnit)}`
    else vendor += ', cell number not stated'
  } else if (form.vendorBasis === 'per-test-volume-not-stated') {
    vendor = `${form.vendorAmountValue} ${form.vendorAmountKind === 'mass' ? unit('ug') : unit(form.vendorAmountUnit)} per test, test volume not stated`
  } else if (form.vendorBasis === 'final-concentration') {
    vendor =
      form.vendorConcentrationKind === 'dilution'
        ? `1 in ${form.vendorConcentrationValue} from stock`
        : `${form.vendorConcentrationValue} ${unit(form.vendorConcentrationUnit)}`
    vendor +=
      form.vendorCellsKind === 'stated'
        ? `, ${formatCellCount(form.vendorCells, form.vendorCellsUnit)}`
        : ', cell number not stated'
  }

  const context =
    `${form.stainingVolume} ${unit(form.stainingVolumeUnit)} final volume, ` +
    `${formatCellCount(form.cellNumber, form.cellNumberUnit)}, ` +
    `pipetting minimum ${form.pipettingMinimum} ${unit('uL')}` +
    (form.pipettingMinimumEntered ? '' : ' (suggestion, unchanged)')

  const FORM_WORD: Record<number, string> = {
    1: `${unit('uL')} of stock per test`,
    2: `${unit('ug')} per test`,
    3: `${unit('ug/mL')} in the stain`,
    4: 'as a dilution factor from stock',
    5: `${unit('ug')} per 10\u2076 cells`,
  }
  // D3: the summary text only ever renders once the panel is complete, which
  // now requires `topForm` to be chosen, so this branch is unreachable in
  // practice; kept explicit rather than trusting that invariant silently.
  const design =
    form.topForm === ''
      ? `top point ${form.topValue}, form not yet chosen, ${form.dilutionFactor}-fold, ${form.points} points`
      : `top point ${form.topValue} ${FORM_WORD[Number(form.topForm)]}, ` +
        `${form.dilutionFactor}-fold, ${form.points} points`

  return {
    stock: `${stock}. Source: ${source}.`,
    vendor,
    context,
    design,
  }
}

export default function App() {
  const initial = useMemo(loadForm, [])
  const [form, setForm] = useState<FormState>(initial.form)
  /**
   * `held` is fixed at load: which fields came back from storage holding a
   * value. `confirmed` grows as the reader edits or confirms, and is what
   * gets persisted. The visible marks are DERIVED from the two rather than
   * being a third piece of state, so they cannot drift from either, and so
   * that a confirmation surviving a reload is structural rather than
   * something a future edit could forget to re-apply.
   */
  const [held] = useState<RetainedFields>(initial.held)
  const [confirmed, setConfirmed] = useState<ConfirmedFields>(initial.confirmed)
  const retained = useMemo(() => retainedMarks(held, confirmed), [held, confirmed])
  const [topPointNeedsReentry, setTopPointNeedsReentry] = useState(initial.topPointNeedsReentry)
  const [imported, setImported] = useState<ImportedMolecularWeight | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /**
   * C4-NF-03. `.series-sticky` (the declaration line and the flag list) stays
   * stuck only as long as its containing block extends below the viewport; a
   * sticky element unsticks near its container's own bottom edge, which,
   * with nothing after the table, arrives before the last few rows have had
   * a chance to reach the viewport under the sticky block. The spacer placed
   * after the table gives the container that much extra room, measured
   * rather than guessed, because how much room is needed depends on the flag
   * text, which depends on the declarations, which this page does not
   * control.
   */
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const [stickyHeight, setStickyHeight] = useState(0)

  /**
   * C4-ST-06. An imported object arrives in the URL FRAGMENT, which a browser
   * never transmits, so nothing needs to be trusted to keep it off a server.
   */
  useEffect(() => {
    const match = /[#&]c1=([A-Za-z0-9_-]+)/.exec(window.location.hash)
    if (match === null) return
    const outcome = decodeEnvelope<Record<string, any>>(match[1], 'c1-conversion')
    if (!outcome.ok) {
      setImportError(outcome.rejection.message)
      return
    }
    const payload = outcome.payload
    const weight = payload?.quantities?.molecularWeight
    if (typeof weight?.value !== 'number') {
      setImportError('The imported object carries no molecular weight, which is the only thing this tool reads from it.')
      return
    }
    setImported({
      gPerMol: weight.unit === 'kDa' ? weight.value * 1000 : weight.value,
      provenance: String(payload.declarations?.molecularWeightProvenance ?? 'not-recorded'),
      massBasis: payload.declarations?.massBasis ?? 'not-recorded',
      flags: Array.isArray(payload.flags) ? payload.flags : [],
      toolVersion: String(payload.tool?.engineVersion ?? 'unknown'),
    })
  }, [])

  /*
   * C4-ST-03. Storage mirrors work in progress: no work, no key.
   *
   * The confirmation set travels WITH the form, in one document, because the
   * two are only meaningful together: a confirmation naming a value that is
   * no longer there says nothing, and a value with its confirmation lost
   * comes back claiming to be unreviewed. `hasContent` still reads the form
   * alone, so "Clear stored data" keeps removing the key rather than leaving
   * a document behind that holds only confirmations.
   */
  useEffect(() => {
    persist(STORAGE_KEY, { form, confirmed: confirmedToList(confirmed) }, hasContent(form))
  }, [form, confirmed])

  /** Editing a field confirms THAT field, and says nothing about any other. */
  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    const field = FIELD_OF[key]
    if (field !== undefined) setConfirmed((current) => confirmFields(current, [field]))
    setCopied(false)
  }

  /**
   * Stand behind everything a panel is still carrying unconfirmed.
   *
   * Clears the retained marks for its fields, and the suggestion markers on
   * the values the tool pre-filled in that panel. It deliberately does NOT
   * touch `pipettingMinimumEntered`: that is the engine's provenance, and a
   * reader confirming that the suggested 2 µL is what they want has agreed to
   * the default, not entered a value of their own. C4-SR-05 requires the
   * output to keep saying which of those two happened, so it keeps saying it.
   */
  const confirmPanel = (step: number) => () => {
    setConfirmed((current) => confirmFields(current, PANEL_FIELDS[step] ?? []))
    if (step === 1) setForm((current) => ({ ...current, stockUnitChosen: true }))
    if (step === 3) {
      setForm((current) => ({
        ...current,
        stainingVolumeUnitChosen: true,
        cellNumberUnitChosen: true,
        pipettingMinimumConfirmed: true,
      }))
    }
    setCopied(false)
  }

  /**
   * Whether a panel still has anything outstanding for the reader to stand
   * behind.
   *
   * A carried-over value always counts, whatever else the panel holds. A
   * suggestion the tool pre-filled counts only once the panel has actually
   * been answered: offering "Confirm these values" against an untouched,
   * empty panel asks the reader to stand behind nothing, and a control that
   * does nothing the first four times it is seen is a control nobody reads
   * the fifth time.
   */
  const panelHasUnconfirmed = (step: number, isComplete: boolean): boolean => {
    const fields = PANEL_FIELDS[step] ?? []
    if (fields.some((field) => retained[field])) return true
    if (!isComplete) return false
    if (step === 1) return !form.stockUnitChosen
    if (step === 3) {
      return (
        !form.stainingVolumeUnitChosen ||
        !form.cellNumberUnitChosen ||
        (!form.pipettingMinimumEntered && !form.pipettingMinimumConfirmed)
      )
    }
    return false
  }

  /*
   * The explanation line, shown once, on the first panel that is actually
   * carrying something from a previous visit. Repeating it on every panel is
   * how a page teaches a reader to stop seeing it.
   */
  const firstRetainedPanel = [1, 2, 3, 4].find((step) =>
    (PANEL_FIELDS[step] ?? []).some((field) => retained[field]),
  )
  const retentionNote = (step: number) =>
    step === firstRetainedPanel ? <p className="retention-note">{RETENTION_PANEL_NOTE}</p> : undefined

  const summaries = panelSummaries(form)
  const complete = panelCompletion(form)
  const missing = missingDeclarations(form)
  const retainedFieldList = RETAINABLE_FIELDS.filter((field) => retained[field])
  const inputs = toSeriesInputs(form, imported, retainedFieldList)
  const outcome: Outcome | null = inputs === null ? null : computeSeries(inputs)
  const result = outcome !== null && outcome.ok ? outcome : null
  const rejections = outcome !== null && !outcome.ok ? outcome.rejections : []

  /*
   * Re-attaches only on mount/unmount of `.series-sticky`; the observer then
   * tracks every subsequent size change (a longer flag list, a wider value)
   * on its own, without the effect needing to re-run.
   *
   * `useLayoutEffect`, and a synchronous `el.offsetHeight` read BEFORE the
   * observer is attached: on a fresh load, the spacer measured `0px` and
   * stayed there until the reader scrolled, because the observer's first
   * callback is a delivery `ResizeObserver` schedules for a later frame, not
   * a synchronous read at attach time, and self-hosted fonts finishing their
   * swap after that first paint changes the block's height without a scroll
   * event to trigger a re-measure. A synchronous read here, before paint,
   * does not depend on that delivery arriving at all; the observer still
   * owns every change after it.
   *
   * Both reads go through `el.offsetHeight` rather than the observer's own
   * `entries[0].contentRect`, deliberately: `contentRect` is the CONTENT
   * box, excluding the 2px `padding-top` `.series-sticky` carries, so
   * reading it from the observer while the mount read used the border box
   * would under-measure by exactly that padding on the first resize.
   */
  useLayoutEffect(() => {
    const el = stickyRef.current
    if (el === null) {
      setStickyHeight(0)
      return
    }
    const measure = () => setStickyHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [result !== null])

  const clearStorage = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to clear if storage was never available.
    }
    setForm(EMPTY_FORM)
    setConfirmed(NOTHING_CONFIRMED)
    setTopPointNeedsReentry(false)
  }

  const copyForNotebook = async () => {
    if (result === null) return
    try {
      await navigator.clipboard.writeText(notebookLine(result))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const rejectionFor = (field: string) => rejections.filter((r) => r.field === field)

  return (
    <FieldHelpProvider>
    <div className="app">
      <SkipLink />
      <Masthead title={TOOL_NAME}>
        Plans an antibody titration series for flow cytometry: the concentration at each point, in
        every form the bench and the method record require, for the staining volume and cell number
        you declare. Every value is computed deterministically by arithmetic you can read. No model
        and no inference is applied to any reported number.
      </Masthead>

      <main id="main">
        <div className="layout">
          <div className="stack">
            {/* ---------------- 1. antibody stock ---------------- */}
            <DeclarationPanel
              step={1}
              title="Antibody stock"
              summary={summaries.stock}
              complete={complete.stock && result !== null}
              retained={retained.stockConcentration || retained.stockSource || retained.stockMassBasis}
              onConfirm={panelHasUnconfirmed(1, complete.stock) ? confirmPanel(1) : undefined}
              note={retentionNote(1)}
            >
                <div className="field">
                  <label htmlFor="stock-kind">
                    Concentration <FieldHelp id="stock-kind" label="Concentration" />
                  </label>
                  <select
                    id="stock-kind"
                    value={form.stockKind}
                    onChange={(e) => {
                      const stockKind = e.target.value as FormState['stockKind']
                      const { form: reconciled, invalidated } = reconcileTopPoint({
                        ...form,
                        stockKind,
                      })
                      setForm(reconciled)
                      if (invalidated) {
                        setConfirmed((current) => confirmFields(current, ['topPoint']))
                        setTopPointNeedsReentry(true)
                      }
                      setCopied(false)
                    }}
                  >
                    <option value="stated">stated by the vendor</option>
                    <option value="not-stated-by-vendor">
                      not stated by vendor (tests per vial only)
                    </option>
                  </select>
                </div>

                {form.stockKind === 'stated' && (
                  <>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="stock-value">
                          Stock concentration <FieldHelp id="stock-value" label="Stock concentration" />
                          <Retained when={retained.stockConcentration} field="stockConcentration" />
                        </label>
                        <input
                          id="stock-value"
                          type="text"
                          inputMode="decimal"
                          value={form.stockValue}
                          placeholder="no default"
                          onChange={(e) => set('stockValue')(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="stock-unit">
                          Unit <FieldHelp id="stock-unit" label="Unit, stock concentration" />
                          <Suggested when={!form.stockUnitChosen} field="stockUnit" />
                        </label>
                        <select
                          id="stock-unit"
                          value={form.stockUnit}
                          onChange={(e) => {
                            set('stockUnit')(e.target.value as ConcentrationUnit)
                            setForm((current) => ({ ...current, stockUnitChosen: true }))
                          }}
                        >
                          {CONCENTRATION_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {UNIT_LABEL[unit]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="stock-mass-basis">
                        The stated mass is the mass of{' '}
                        <FieldHelp id="stock-mass-basis" label="The stated mass is the mass of" />
                        <Retained when={retained.stockMassBasis} field="stockMassBasis" />
                      </label>
                      <select
                        id="stock-mass-basis"
                        value={form.stockMassBasis}
                        onChange={(e) => set('stockMassBasis')(e.target.value as FormState['stockMassBasis'])}
                      >
                        <option value="">select</option>
                        {STOCK_MASS_BASES.map((basis) => (
                          <option key={basis} value={basis}>
                            {STOCK_MASS_BASIS_LABEL[basis]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="field">
                  <label htmlFor="stock-source">
                    Where the concentration came from{' '}
                    <FieldHelp id="stock-source" label="Where the concentration came from" />
                    <Retained when={retained.stockSource} field="stockSource" />
                  </label>
                  <select
                    id="stock-source"
                    value={form.stockSource}
                    onChange={(e) => set('stockSource')(e.target.value as FormState['stockSource'])}
                  >
                    <option value="">select</option>
                    {STOCK_SOURCES.map((source) => (
                      <option key={source} value={source}>
                        {STOCK_SOURCE_LABEL[source]}
                      </option>
                    ))}
                  </select>
                </div>

                <RejectionList rejections={rejectionFor('stock-concentration')} />
            </DeclarationPanel>

            {/* ---------------- 2. vendor recommendation ---------------- */}
            <DeclarationPanel
              step={2}
              title="Vendor recommendation"
              summary={summaries.vendor}
              complete={complete.vendor && result !== null}
              retained={retained.vendorBasis || retained.vendorAmount || retained.vendorTestVolume || retained.vendorCellNumber}
              onConfirm={panelHasUnconfirmed(2, complete.vendor) ? confirmPanel(2) : undefined}
              note={retentionNote(2)}
            >
                <div className="field">
                  <label htmlFor="vendor-basis">
                    Basis of the recommendation{' '}
                    <FieldHelp id="vendor-basis" label="Basis of the recommendation" />
                    <Retained when={retained.vendorBasis} field="vendorBasis" />
                  </label>
                  <select
                    id="vendor-basis"
                    value={form.vendorBasis}
                    onChange={(e) => set('vendorBasis')(e.target.value as FormState['vendorBasis'])}
                  >
                    {VENDOR_BASES.map((basis) => (
                      <option key={basis} value={basis}>
                        {VENDOR_BASIS_LABEL[basis]}
                      </option>
                    ))}
                  </select>
                </div>

                {(form.vendorBasis === 'per-test-volume-stated' ||
                  form.vendorBasis === 'per-test-volume-not-stated') && (
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="vendor-amount">
                        Amount per test <FieldHelp id="vendor-amount" label="Amount per test" />
                        <Retained when={retained.vendorAmount} field="vendorAmount" />
                      </label>
                      <input
                        id="vendor-amount"
                        type="text"
                        inputMode="decimal"
                        value={form.vendorAmountValue}
                        onChange={(e) => set('vendorAmountValue')(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="vendor-amount-unit">Unit</label>
                      <select
                        id="vendor-amount-unit"
                        value={form.vendorAmountKind === 'mass' ? 'ug' : form.vendorAmountUnit}
                        onChange={(e) => {
                          if (e.target.value === 'ug') set('vendorAmountKind')('mass')
                          else {
                            set('vendorAmountKind')('volume')
                            set('vendorAmountUnit')(e.target.value as VolumeUnit)
                          }
                        }}
                      >
                        {VOLUME_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABEL[unit]}
                          </option>
                        ))}
                        <option value="ug">{UNIT_LABEL.ug}</option>
                      </select>
                    </div>
                  </div>
                )}

                {form.vendorBasis === 'per-test-volume-stated' && (
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="vendor-test-volume">
                        Vendor test volume{' '}
                        <FieldHelp id="vendor-test-volume" label="Vendor test volume" />
                        <Retained when={retained.vendorTestVolume} field="vendorTestVolume" />
                      </label>
                      <input
                        id="vendor-test-volume"
                        type="text"
                        inputMode="decimal"
                        value={form.vendorTestVolume}
                        onChange={(e) => set('vendorTestVolume')(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="vendor-test-volume-unit">Unit</label>
                      <select
                        id="vendor-test-volume-unit"
                        value={form.vendorTestVolumeUnit}
                        onChange={(e) => set('vendorTestVolumeUnit')(e.target.value as VolumeUnit)}
                      >
                        {VOLUME_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABEL[unit]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {form.vendorBasis === 'final-concentration' && (
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="vendor-concentration">
                        Recommended <Retained when={retained.vendorAmount} field="vendorAmountConc" />
                      </label>
                      <input
                        id="vendor-concentration"
                        type="text"
                        inputMode="decimal"
                        value={form.vendorConcentrationValue}
                        onChange={(e) => set('vendorConcentrationValue')(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="vendor-concentration-unit">As</label>
                      <select
                        id="vendor-concentration-unit"
                        value={
                          form.vendorConcentrationKind === 'dilution'
                            ? 'dilution'
                            : form.vendorConcentrationUnit
                        }
                        onChange={(e) => {
                          if (e.target.value === 'dilution') set('vendorConcentrationKind')('dilution')
                          else {
                            set('vendorConcentrationKind')('concentration')
                            set('vendorConcentrationUnit')(e.target.value as ConcentrationUnit)
                          }
                        }}
                      >
                        {CONCENTRATION_UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {UNIT_LABEL[unit]}
                          </option>
                        ))}
                        <option value="dilution">a dilution factor from stock</option>
                      </select>
                    </div>
                  </div>
                )}

                {(form.vendorBasis === 'per-test-volume-stated' ||
                  form.vendorBasis === 'final-concentration') && (
                  <>
                    <div className="field">
                      <label htmlFor="vendor-cells-kind">
                        Vendor's stated cell number{' '}
                        <FieldHelp id="vendor-cells-kind" label="Vendor's stated cell number" />
                      </label>
                      <select
                        id="vendor-cells-kind"
                        value={form.vendorCellsKind}
                        onChange={(e) => set('vendorCellsKind')(e.target.value as FormState['vendorCellsKind'])}
                      >
                        <option value="not-stated">not stated by the vendor</option>
                        <option value="stated">stated</option>
                      </select>
                    </div>
                    {form.vendorCellsKind === 'stated' && (
                      <div className="field-row">
                        <div className="field">
                          <label htmlFor="vendor-cells">
                            Vendor's stated cells per test{' '}
                            <FieldHelp id="vendor-cells" label="Vendor's stated cells per test" />
                            <Retained when={retained.vendorCellNumber} field="vendorCellNumber" />
                          </label>
                          <input
                            id="vendor-cells"
                            type="text"
                            inputMode="decimal"
                            value={form.vendorCells}
                            onChange={(e) => set('vendorCells')(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="vendor-cells-unit">Unit</label>
                          <select
                            id="vendor-cells-unit"
                            value={form.vendorCellsUnit}
                            onChange={(e) => set('vendorCellsUnit')(e.target.value as CellUnit)}
                          >
                            {CELL_UNITS.map((unit) => (
                              <option key={unit} value={unit}>
                                {UNIT_LABEL[unit]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </>
                )}
            </DeclarationPanel>

            {/* ---------------- 3. staining context ---------------- */}
            <DeclarationPanel
              step={3}
              title="Staining context"
              summary={summaries.context}
              complete={complete.context && result !== null}
              retained={retained.stainingVolume || retained.cellNumber || retained.pipettingMinimum}
              onConfirm={panelHasUnconfirmed(3, complete.context) ? confirmPanel(3) : undefined}
              note={retentionNote(3)}
            >
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="staining-volume">
                      Staining volume <FieldHelp id="staining-volume" label="Staining volume" />
                      <Retained when={retained.stainingVolume} field="stainingVolume" />
                    </label>
                    <input
                      id="staining-volume"
                      type="text"
                      inputMode="decimal"
                      value={form.stainingVolume}
                      onChange={(e) => set('stainingVolume')(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="staining-volume-unit">
                      Unit <FieldHelp id="staining-volume-unit" label="Unit, staining volume" />
                      <Suggested when={!form.stainingVolumeUnitChosen} field="stainingVolumeUnit" />
                    </label>
                    <select
                      id="staining-volume-unit"
                      value={form.stainingVolumeUnit}
                      onChange={(e) => {
                        set('stainingVolumeUnit')(e.target.value as VolumeUnit)
                        setForm((current) => ({ ...current, stainingVolumeUnitChosen: true }))
                      }}
                    >
                      {VOLUME_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABEL[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="cell-number">
                      Cells per test <FieldHelp id="cell-number" label="Cells per test" />
                      <Retained when={retained.cellNumber} field="cellNumber" />
                    </label>
                    <input
                      id="cell-number"
                      type="text"
                      inputMode="decimal"
                      value={form.cellNumber}
                      onChange={(e) => set('cellNumber')(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="cell-number-unit">
                      Unit
                      <Suggested when={!form.cellNumberUnitChosen} field="cellNumberUnit" />
                    </label>
                    <select
                      id="cell-number-unit"
                      value={form.cellNumberUnit}
                      onChange={(e) => {
                        set('cellNumberUnit')(e.target.value as CellUnit)
                        setForm((current) => ({ ...current, cellNumberUnitChosen: true }))
                      }}
                    >
                      {CELL_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABEL[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="pipetting-minimum">
                    Minimum reliable pipetting volume, µL{' '}
                    <FieldHelp id="pipetting-minimum" label="Minimum reliable pipetting volume" />
                    {/* The marker asks "has the reader stood behind this", which
                        confirming answers. `pipettingMinimumEntered`, which drives
                        the provenance on the output, asks whether they typed a
                        number, which confirming does not change. */}
                    <Suggested
                      when={!form.pipettingMinimumEntered && !form.pipettingMinimumConfirmed}
                      field="pipettingMinimum"
                    />
                    <Retained when={retained.pipettingMinimum} field="pipettingMinimum" />
                  </label>
                  <input
                    id="pipetting-minimum"
                    type="text"
                    inputMode="decimal"
                    value={form.pipettingMinimum}
                    onChange={(e) => {
                      set('pipettingMinimum')(e.target.value)
                      setForm((current) => ({ ...current, pipettingMinimumEntered: true }))
                    }}
                  />
                </div>

                <RejectionList rejections={[...rejectionFor('staining-volume'), ...rejectionFor('cell-number'), ...rejectionFor('pipetting-minimum')]} />
            </DeclarationPanel>

            {/* ---------------- 4. series design ---------------- */}
            <DeclarationPanel
              step={4}
              title="Series design"
              summary={summaries.design}
              complete={complete.design && result !== null}
              retained={retained.topPoint || retained.dilutionFactor || retained.points}
              onConfirm={panelHasUnconfirmed(4, complete.design) ? confirmPanel(4) : undefined}
              note={retentionNote(4)}
            >
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="top-value">
                      Top point <FieldHelp id="top-value" label="Top point" />
                      <Retained when={retained.topPoint} field="topPoint" />{' '}
                      <NeedsReentry when={topPointNeedsReentry} />
                    </label>
                    <input
                      id="top-value"
                      type="text"
                      inputMode="decimal"
                      value={form.topValue}
                      onChange={(e) => {
                        set('topValue')(e.target.value)
                        setTopPointNeedsReentry(false)
                      }}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="top-form">
                      Entered as <FieldHelp id="top-form" label="Entered as" />
                    </label>
                    <select
                      id="top-form"
                      value={form.topForm}
                      onChange={(e) => {
                        set('topForm')(e.target.value as FormState['topForm'])
                        setTopPointNeedsReentry(false)
                      }}
                    >
                      <option value="">select</option>
                      {TOP_FORM_OPTIONS.filter((option) =>
                        acceptedTopPointForms(form.stockKind).includes(option.form),
                      ).map((option) => (
                        <option key={option.form} value={option.form}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Not `.hint`, and not guidance: this explains why a value
                    the reader entered is no longer there, which is a state
                    message about what happened, in the same family as the
                    retention note. Guidance about what to type in this field
                    is behind the trigger on its label. */}
                {topPointNeedsReentry && (
                  <p className="field-note">
                    The top point was cleared: its form stopped being computable when the stock
                    declaration last changed. Re-enter it in a form the current stock declaration
                    supports.
                  </p>
                )}

                <div className="field-row">
                  <div className="field">
                    <label htmlFor="dilution-factor">
                      Dilution factor between points{' '}
                      <FieldHelp id="dilution-factor" label="Dilution factor between points" />
                      <Retained when={retained.dilutionFactor} field="dilutionFactor" />
                    </label>
                    <input
                      id="dilution-factor"
                      type="text"
                      inputMode="decimal"
                      value={form.dilutionFactor}
                      placeholder="2, 3, 2.5 ..."
                      onChange={(e) => set('dilutionFactor')(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="points">
                      Points <FieldHelp id="points" label="Points" />
                      <Retained when={retained.points} field="points" />
                    </label>
                    <input
                      id="points"
                      type="text"
                      inputMode="decimal"
                      value={form.points}
                      placeholder={`${MIN_POINTS} to ${MAX_POINTS}`}
                      onChange={(e) => set('points')(e.target.value)}
                    />
                  </div>
                </div>

                <RejectionList rejections={[...rejectionFor('dilution-factor'), ...rejectionFor('points'), ...rejectionFor('top-point')]} />
            </DeclarationPanel>

            <Method
              result={result}
              storageKeys={[STORAGE_KEY]}
              onClearStorage={clearStorage}
              importAttempted={imported !== null || importError !== null}
            />
          </div>

          {/* ---------------- results ---------------- */}
          <div className="rail">
            <section className="panel panel-series">
              <div className="panel-head">
                <div className="titles">
                  <h2>The series</h2>
                </div>
                {result !== null && (
                  <div className="button-row">
                    <button type="button" onClick={copyForNotebook}>
                      {copied ? 'Copied' : 'Copy for notebook'}
                    </button>
                  </div>
                )}
              </div>
              <div className="panel-body">
                {importError !== null && (
                  <div className="flag">
                    <span>
                      <strong>C4-ST-07</strong>
                      {importError}
                    </span>
                  </div>
                )}

                {result === null && rejections.length === 0 && (
                  <div className="empty">
                    <p>Nothing is computed yet.</p>
                    {missing.length > 0 && (
                      <p className="hint">
                        A series needs {missing.join(', ')}. None of these is defaulted, because each
                        one changes what the volumes below mean.
                      </p>
                    )}
                  </div>
                )}

                {rejections.length > 0 && (
                  <>
                    <p className="hint">
                      No series is computed, because these declarations describe something that
                      cannot exist.
                    </p>
                    <RejectionList rejections={rejections} />
                  </>
                )}

                {result !== null && (
                  <>
                    {/*
                      C4-NF-03 as restated at v0.5, and C4-NF-07: a series
                      point is never read apart from the declarations and
                      flags it was designed under. `.series-sticky` pins this
                      block to the top of the viewport for as long as any row
                      of the table below it is in view, under window scroll.
                      D2, Nadira's second review: at four flags the earlier
                      version of this block, carrying full flag text, measured
                      taller than the reference viewport with no declaration
                      in view, so the property held only for a one-flag
                      series. Bounded now in two ways that do not depend on
                      how many flags a series happens to raise: the
                      declaration line is six fields, not a paragraph per
                      field, and the flags are `FlagSummaryList`, one line
                      each behind an expander, with a fixed-height scroll of
                      its own as a second, independent floor. Retained/default
                      marks are C4-ST-03's other half: a reader must not read
                      a row under a value carried from a previous session, or
                      pre-filled by a suggestion, without being told so where
                      the row itself is visible.
                    */}
                    <div className="series-sticky" ref={stickyRef}>
                      <dl className="rail-declarations">
                        <div>
                          <dt>Staining volume</dt>
                          <dd>
                            {formatSigFigs(result.normalised.stainingVolumeUl)} {UNIT_LABEL.uL}, final
                            <Retained when={retained.stainingVolume} field="rail-stainingVolume" />
                          </dd>
                        </div>
                        <div>
                          <dt>Cells per test</dt>
                          <dd>
                            {formatSigFigs(result.normalised.cells)}
                            <Retained when={retained.cellNumber} field="rail-cellNumber" />
                          </dd>
                        </div>
                        <div>
                          {/* I1: added to the required-values list this row
                              carries, alongside the vendor recommendation
                              values already folded into "Vendor basis" below. */}
                          <dt>Stock concentration</dt>
                          <dd>
                            {result.inputs.stock.kind === 'stated'
                              ? `${result.inputs.stock.concentration.value} ${UNIT_LABEL[result.inputs.stock.concentration.unit]}, ${STOCK_SOURCE_LABEL[result.inputs.stockSource]}`
                              : 'not stated by the vendor'}
                            <Retained when={retained.stockConcentration || retained.stockSource} field="rail-stock" />
                          </dd>
                        </div>
                        <div>
                          <dt>Vendor basis</dt>
                          <dd>
                            {vendorBasisSummary(result)}
                            <Retained when={retained.vendorBasis} field="rail-vendorBasis" />
                          </dd>
                        </div>
                        <div>
                          {/* I2: the short label. The 30-word guidance stays
                              only in the dropdown that chooses this. */}
                          <dt>Stock mass basis</dt>
                          <dd>
                            {result.inputs.stock.kind === 'stated'
                              ? STOCK_MASS_BASIS_SHORT[result.inputs.stock.massBasis]
                              : 'not stated by the vendor'}
                            <Retained when={retained.stockMassBasis} field="rail-stockMassBasis" />
                          </dd>
                        </div>
                        <div>
                          <dt>Pipetting minimum</dt>
                          <dd>
                            {formatSigFigs(result.normalised.pipettingMinimumUl)} {UNIT_LABEL.uL},{' '}
                            {result.inputs.pipettingMinimum.provenance === 'entered' ? 'entered' : 'suggested default'}
                            <Retained when={retained.pipettingMinimum} field="rail-pipettingMinimum" />
                          </dd>
                        </div>
                      </dl>
                      <FlagSummaryList flags={result.flags} />
                      {result.flags.length === 0 && (
                        <p className="hint">
                          No flags raised. The declarations are consistent and every point can be
                          pipetted from stock. That is not a statement that this series brackets the
                          optimum, which this tool cannot determine.
                        </p>
                      )}
                    </div>
                    <SeriesTable result={result} />
                    {/* D2: the full flag text, moved out of the sticky block
                        and below the table, per Nadira's instruction; the
                        sticky block carries only the compact form above. */}
                    <FlagList flags={result.flags} />
                    {/* Runway for `.series-sticky` to stay stuck through the last
                        row; see the effect above for why it is measured, not
                        fixed. */}
                    <div aria-hidden="true" className="series-sticky-spacer" style={{ height: stickyHeight }} />
                  </>
                )}
              </div>
            </section>

            {result !== null && (
              <section className="panel">
                <div className="panel-head">
                  <div className="titles">
                    <h2>Derivation</h2>
                  </div>
                </div>
                <div className="panel-body">
                  <dl className="detail-grid">
                    <dt>Staining volume</dt>
                    <dd>
                      {formatSigFigs(result.normalised.stainingVolumeUl)} {UNIT_LABEL.uL}, final,
                      including antibody
                    </dd>
                    <dt>Cells per test</dt>
                    <dd>{formatSigFigs(result.normalised.cells)}</dd>
                    <dt>Cell density</dt>
                    <dd>
                      {formatSigFigs(result.normalised.cellsPerUl)} cells/{UNIT_LABEL.uL}
                    </dd>
                    <dt>Top point, as entered</dt>
                    <dd className="prose-dd">
                      {form.topValue} in form {form.topForm}
                    </dd>
                    <dt>Top point, derived</dt>
                    <dd>
                      {result.anchor.kind === 'concentration'
                        ? `${formatSigFigs(result.anchor.ugPerMl)} ${UNIT_LABEL['ug/mL']} in the stain`
                        : `${formatSigFigs(result.anchor.ul)} ${UNIT_LABEL.uL} of stock`}
                    </dd>
                    <dt>Stock provenance</dt>
                    <dd className="prose-dd">{STOCK_SOURCE_LABEL[result.inputs.stockSource]}</dd>
                    <dt>Stock mass basis</dt>
                    <dd className="prose-dd">
                      {result.inputs.stock.kind === 'stated'
                        ? STOCK_MASS_BASIS_SHORT[result.inputs.stock.massBasis]
                        : 'no concentration stated by the vendor'}
                    </dd>
                    <dt>Vendor basis</dt>
                    <dd className="prose-dd">{VENDOR_BASIS_LABEL[result.inputs.vendor.basis]}</dd>
                    <dt>Pipetting minimum</dt>
                    <dd>
                      {formatSigFigs(result.normalised.pipettingMinimumUl)} {UNIT_LABEL.uL},{' '}
                      {result.inputs.pipettingMinimum.provenance === 'entered'
                        ? 'entered'
                        : 'left at the suggested default'}
                    </dd>
                    {imported !== null && (
                      <>
                        <dt>Imported molecular weight</dt>
                        <dd>{formatSigFigs(imported.gPerMol)} g/mol</dd>
                        <dt>Its mass basis</dt>
                        <dd className="prose-dd">{IMPORTED_MASS_BASIS_LABEL[imported.massBasis]}</dd>
                      </>
                    )}
                    <dt>Engine version</dt>
                    <dd>{result.engineVersion}</dd>
                  </dl>
                </div>
              </section>
            )}

            {result !== null && (
              <section className="panel">
                <div className="panel-head">
                  <div className="titles">
                    <h2>Structured result</h2>
                  </div>
                </div>
                <div className="panel-body">
                  <p className="hint">
                    The machine-readable object, carrying the unrounded value of every quantity with
                    its unit, the flags at both series and point level, and every declaration this
                    series rests on. It is a projection of the same computation the table above
                    shows, so the two cannot disagree.
                  </p>
                  <details className="options">
                    <summary>Show the object</summary>
                    <pre>{toJson(result)}</pre>
                  </details>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />

      <p className="disclaimer">
        <strong>{SCOPE_STATEMENT}</strong> This tool determines the target concentration at each
        point of a titration series. It does not prepare the series, does not observe what was
        pipetted, does not analyse the resulting data, does not choose the optimal point, and cannot
        determine whether any point saturates the target. A vendor recommendation is a concentration
        chosen for a stated assay and does not establish saturation. All computation is performed
        locally in this browser. Nothing you enter is transmitted.
      </p>

      <div className="colophon">
        <LigantMark size={16} />
        <span>
          Ligant · {TOOL_NAME} {APP_VERSION}
        </span>
      </div>
    </div>
    </FieldHelpProvider>
  )
}
