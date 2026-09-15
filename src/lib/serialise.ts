/**
 * C4-OUT-03: the structured, machine-readable result object.
 *
 * WHY THIS SCHEMA IS OWNED BY C4. C4-OUT-04 requires the object to use the same
 * format as C1 and the shipped Antigen Density Calculator, and to STOP AND
 * ESCALATE rather than extend that format locally if it cannot express a
 * series. Both halves of that instruction have now been carried out, and the
 * finding is recorded in docs/open-item-08-shared-format-finding.md:
 *
 *   The ADC has no structured result object at all. It exports CSV and SVG.
 *   C1 recorded the same finding against it before this tool existed.
 *
 *   C1's object, `ligant-benchtools-c1-conversion`, describes ONE conversion.
 *   Its `quantities` is a flat record of four fixed keys and its `flags` is a
 *   flat array with no point scope. It cannot express an ordered series of up
 *   to twelve points, each carrying up to six forms, with a point-level flag
 *   array beside the series-level one. That is not a defect in C1: it is a
 *   single-value tool and its object is the right shape for it.
 *
 * So this schema is C4's, versioned separately from the engine, exactly as C1
 * versions its own. What it does NOT do is invent a new vocabulary: every shape
 * C1 already defines is reused verbatim, so a consumer written against one can
 * read the other's parts without translation:
 *
 *   `Quantity`       { value, unit, underflowed }, with the UNROUNDED value
 *   `StructuredFlag` { code, message, evaluatedOn, kind }, plus `points`
 *   the `schema` / `tool` / `declarations` / `displayed` / `derivation` /
 *   `statements` top-level division
 *
 * The series dimension is added around that, not through it. Reconciliation
 * with a bench-tools format, if one is ever settled, is what `schema.version`
 * exists to make visible rather than silent.
 *
 * C4-OUT-05: this is a PROJECTION of what `compute.ts` returned, not a
 * recomputation. There is no arithmetic in this file, which is the reason the
 * structured and human-readable outputs cannot disagree.
 *
 * C4-UN-07: every `value` is the unrounded double. The three-significant-figure
 * renderings are carried alongside under `displayed` and are never the only
 * form a quantity appears in.
 */

import type { SeriesResult } from './compute'
import { computeSeries } from './compute'
import { DISPLAY_SIG_FIGS, ROUNDING_MODE, formatSigFigs } from './format'
import type { FormValue } from './forms'
import type { Flag, FlagCode } from './flags'
import {
  DETERMINES_NOT_VERIFIES_STATEMENT,
  DILUTION_CONVENTION_STATEMENT,
  SCOPE_STATEMENT,
  STAINING_VOLUME_STATEMENT,
  THRESHOLD_EVALUATION_STATEMENT,
} from './flags'
import { PRECISION_STATEMENT } from './format'
import { TOOL_ID, TOOL_NAME } from './site'
import { FORMS, FORM_LABEL, type FormId } from './units'
import type { SeriesInputs } from './normalise'
import type { RetainableField } from './retention'

export const SCHEMA_NAME = 'ligant-benchtools-c4-series'

/**
 * The schema's own version, independent of the engine's.
 *
 * C4-NF-06 ties the engine version to calculation behaviour. A change to the
 * shape of this object is not a change to the numbers, and versioning the two
 * together would make one of them lie. They move separately and both are on the
 * object. C1 draws the same distinction for the same reason.
 */
/**
 * Bumped to 1.1.0, 15 September 2026: `declarations.retained` is new
 * (Nadira's review, item 2). Additive and backward compatible, a consumer
 * reading a 1.0.0 object never sees it and one reading a 1.1.0 object that
 * does not know it can ignore it, so this is a minor version, not a major
 * one; nothing already on the object changed shape.
 */
export const SCHEMA_VERSION = '1.1.0'

/** A number that means nothing without its unit, carrying it. C1's shape. */
export interface Quantity<U extends string = string> {
  /** Unrounded, per C4-UN-07. */
  value: number
  unit: U
  /**
   * True when this value is a zero that is NOT the value: the computation
   * underflowed the double range in this unit.
   *
   * On the quantity rather than beside it, for the same reason the unit is: a
   * consumer holding one quantity in isolation must be able to tell. Always
   * present, never implied by absence.
   */
  underflowed: boolean
}

/** A form that has no value, and the two different reasons it might not. */
export interface AbsentForm {
  state: 'not-computable' | 'withheld'
  reason: string
}

export type StructuredForm = ({ state: 'computed' } & Quantity) | AbsentForm

export interface StructuredFlag {
  /** The machine-readable reason code section 8 requires. */
  code: FlagCode
  message: string
  evaluatedOn: string
  kind: Flag['kind']
  /** C4-OUT-04. Present only where the flag names points. */
  points?: number[]
  remedy?: string
}

export interface StructuredPoint {
  /** C4-SR-03. One-based, index 1 being the top point. */
  index: number
  forms: Record<string, StructuredForm>
  /**
   * C4-OUT-04. The point-level flag array, beside the series-level one.
   *
   * This is the field the whole of open item 8 turns on. C4-FL-03 names
   * specific points, and a series-level list loses which. A consumer planning
   * an intermediate working stock, which is what C3 will do, reads this.
   */
  flags: StructuredFlag[]
  /** C4-DT-04, where a vendor recommendation with a stated volume was entered. */
  vendorMultiple: { atVendorTestVolume: number; atStainingVolume: number; identical: boolean } | null
  displayed: Record<string, string>
}

export interface StructuredResult {
  schema: { name: string; version: string }
  tool: { id: string; name: string; engineVersion: string }
  series: {
    pointCount: number
    dilutionFactor: number
    /** C4-IV-06. The tolerance is derived over this method and no other. */
    generationMethod: string
    anchor: { basis: 'concentration' | 'volume'; value: number; unit: string }
    points: StructuredPoint[]
  }
  /**
   * C4-OUT-01. Every input echoed with its unit AND the form it was entered in.
   *
   * The whole `SeriesInputs` object, not a summary of it. C4-SR-01 makes the
   * entered form of the top point the persisted input, so a consumer that
   * received only the derived anchor could not tell a volume-entered series
   * from a mass-entered one, and `reproduceFrom` below could not reproduce it.
   */
  inputs: SeriesInputs
  declarations: {
    stockSource: string
    stockMassBasis: string | null
    vendorBasis: string
    vendorTestVolume: Quantity | null
    vendorCellNumber: Quantity | null
    /**
     * C4-SR-05 and R16. The declared minimum AND whether it was entered or left
     * at the default, because the default is on the behaviour path whenever it
     * is unchanged, and a handoff that lost the distinction would present a
     * suggestion as a decision.
     */
    pipettingMinimum: Quantity & { provenance: 'entered' | 'default' }
    /** C4-SC-04. Recorded as a declaration; no threshold is applied to it. */
    cellDensity: Quantity
    /**
     * C4-ST-03 and C4-NF-07, Nadira's review, item 2. Which declarations this
     * series was computed under still hold a value restored from a previous
     * session and not confirmed or edited in this one, alongside the existing
     * `pipettingMinimum.provenance`. Empty when nothing was retained, which is
     * the honest state for a series built entirely from this session's input.
     */
    retained: readonly RetainableField[]
    imported: {
      molecularWeight: Quantity
      provenance: string
      massBasis: string
      flags: { code: string; message: string }[]
      toolVersion: string
    } | null
  }
  displayed: {
    significantFigures: number
    roundingMode: typeof ROUNDING_MODE
  }
  /** Series-level flags. Point-level scope is on the points, per C4-OUT-04. */
  flags: StructuredFlag[]
  derivation: {
    relations: string[]
    unitHandling: string
    assumptions: string[]
  }
  statements: {
    scope: string
    precision: string
    stainingVolume: string
    dilutionConvention: string
    determinesNotVerifies: string
    thresholdEvaluation: string
  }
}

const UNIT_HANDLING =
  'Every quantity is converted to a base unit exactly once, at entry: microlitres, micrograms ' +
  'per millilitre, and cells. The unit factors are folded into one constant per reported form, ' +
  'so no value is normalised twice and no form is derived from another form that has already ' +
  'been rounded.'

function toStructuredFlag(flag: Flag): StructuredFlag {
  const structured: StructuredFlag = {
    code: flag.code,
    message: flag.message,
    evaluatedOn: flag.evaluatedOn,
    kind: flag.kind,
  }
  if (flag.points !== undefined) structured.points = [...flag.points]
  if (flag.remedy !== undefined) structured.remedy = flag.remedy
  return structured
}

/**
 * A form as the object carries it.
 *
 * `underflowed` distinguishes a computed zero from a value too small to
 * represent in the reported unit. A bare zero is not a rounded version of the
 * true value; it is a different number, and a reimplementation with a wider
 * exponent range returns something positive for the same input.
 */
function toStructuredForm(form: FormValue, sourceIsNonZero: boolean): StructuredForm {
  if (form.state !== 'computed') return { state: form.state, reason: form.reason }
  return {
    state: 'computed',
    value: form.value,
    unit: form.unit,
    underflowed: form.value === 0 && sourceIsNonZero,
  }
}

/** C4-OUT-03. Produced for every series, from the one computation. */
export function toStructuredResult(result: SeriesResult): StructuredResult {
  const { inputs, normalised: base } = result

  const pointFlags = (index: number): StructuredFlag[] =>
    result.flags.filter((f) => f.points?.includes(index)).map(toStructuredFlag)

  return {
    schema: { name: SCHEMA_NAME, version: SCHEMA_VERSION },
    tool: { id: TOOL_ID, name: TOOL_NAME, engineVersion: result.engineVersion },
    series: {
      pointCount: inputs.points,
      dilutionFactor: inputs.dilutionFactor,
      generationMethod: result.generationMethod,
      anchor:
        result.anchor.kind === 'concentration'
          ? { basis: 'concentration', value: result.anchor.ugPerMl, unit: 'ug/mL' }
          : { basis: 'volume', value: result.anchor.ul, unit: 'uL' },
      points: result.points.map((point) => {
        const sourceIsNonZero =
          point.concentrationUgPerMl !== null ? point.concentrationUgPerMl > 0 : (point.volumeUl ?? 0) > 0
        const forms: Record<string, StructuredForm> = {}
        const displayed: Record<string, string> = {}
        for (const id of FORMS) {
          const structured = toStructuredForm(point.forms[id], sourceIsNonZero)
          forms[String(id)] = structured
          displayed[String(id)] =
            structured.state === 'computed' ? formatSigFigs(structured.value) : structured.reason
        }
        return {
          index: point.index,
          forms,
          flags: pointFlags(point.index),
          vendorMultiple: point.vendorMultiple,
          displayed,
        }
      }),
    },
    inputs,
    declarations: {
      stockSource: inputs.stockSource,
      stockMassBasis: inputs.stock.kind === 'stated' ? inputs.stock.massBasis : null,
      vendorBasis: inputs.vendor.basis,
      vendorTestVolume:
        result.vendor?.vendorTestVolumeUl != null
          ? { value: result.vendor.vendorTestVolumeUl, unit: 'uL', underflowed: false }
          : null,
      vendorCellNumber:
        result.vendor?.vendorCells != null
          ? { value: result.vendor.vendorCells, unit: 'cells', underflowed: false }
          : null,
      pipettingMinimum: {
        value: base.pipettingMinimumUl,
        unit: 'uL',
        underflowed: false,
        provenance: inputs.pipettingMinimum.provenance,
      },
      cellDensity: { value: base.cellsPerUl, unit: 'cells/uL', underflowed: false },
      retained: inputs.retainedFields ?? [],
      imported:
        inputs.imported === null
          ? null
          : {
              molecularWeight: { value: inputs.imported.gPerMol, unit: 'g/mol', underflowed: false },
              provenance: inputs.imported.provenance,
              massBasis: inputs.imported.massBasis,
              flags: inputs.imported.flags.map((f) => ({ code: f.code, message: f.message })),
              toolVersion: inputs.imported.toolVersion,
            },
    },
    displayed: { significantFigures: DISPLAY_SIG_FIGS, roundingMode: ROUNDING_MODE },
    flags: result.flags.map(toStructuredFlag),
    derivation: {
      relations: [...result.relations],
      unitHandling: UNIT_HANDLING,
      assumptions: [...result.assumptions],
    },
    statements: {
      scope: SCOPE_STATEMENT,
      precision: PRECISION_STATEMENT,
      stainingVolume: STAINING_VOLUME_STATEMENT,
      dilutionConvention: DILUTION_CONVENTION_STATEMENT,
      determinesNotVerifies: DETERMINES_NOT_VERIFIES_STATEMENT,
      thresholdEvaluation: THRESHOLD_EVALUATION_STATEMENT,
    },
  }
}

/** The serialised form. Stable key order, so two runs of one case diff cleanly. */
export function toJson(result: SeriesResult): string {
  return JSON.stringify(toStructuredResult(result), null, 2)
}

/**
 * Recompute the result from the object alone.
 *
 * Reads only the structured object. If a field the reproduction needs were
 * dropped from the schema this stops compiling or stops agreeing, which is the
 * point of writing it as code rather than asserting sufficiency in a comment.
 * `schema.test.ts` runs it over the whole fixture set.
 */
export function reproduceFrom(obj: StructuredResult): SeriesResult {
  const outcome = computeSeries(obj.inputs)
  if (!outcome.ok) {
    throw new Error(
      `the structured object did not reproduce: ${outcome.rejections.map((r) => r.code).join(', ')}`,
    )
  }
  return outcome
}

export interface ValidationProblem {
  path: string
  problem: string
}

/**
 * Structural validation, as acceptance 4 requires.
 *
 * Deliberately strict about the two properties that motivated the requirement:
 * a quantity is a value AND a unit, and a unit that is an empty string is not a
 * unit; and a point carries its own flag array, because that is the property
 * C4-OUT-04 says a format must have or be escalated.
 */
export function validateStructuredResult(obj: unknown): ValidationProblem[] {
  const problems: ValidationProblem[] = []
  const fail = (path: string, problem: string) => problems.push({ path, problem })

  if (typeof obj !== 'object' || obj === null) return [{ path: '', problem: 'not an object' }]
  const o = obj as Record<string, any>

  if (o.schema?.name !== SCHEMA_NAME) fail('schema.name', `expected ${SCHEMA_NAME}`)
  if (typeof o.schema?.version !== 'string' || !o.schema.version) fail('schema.version', 'missing')
  if (typeof o.tool?.engineVersion !== 'string' || !o.tool.engineVersion) {
    fail('tool.engineVersion', 'missing: C4-NF-06 and C4-OUT-01 require it on the output')
  }

  const points = o.series?.points
  if (!Array.isArray(points) || points.length === 0) {
    fail('series.points', 'missing: a series is an ordered set of points')
  } else {
    points.forEach((point: any, i: number) => {
      const at = `series.points[${i}]`
      if (point?.index !== i + 1) fail(`${at}.index`, 'points are one-based and in order')
      if (!Array.isArray(point?.flags)) {
        fail(
          `${at}.flags`,
          'missing: C4-OUT-04 requires point-level flag scope in addition to the series-level array',
        )
      }
      for (const id of FORMS) {
        const form = point?.forms?.[String(id)]
        const path = `${at}.forms.${id}`
        if (typeof form !== 'object' || form === null) {
          fail(path, `missing: ${FORM_LABEL[id as FormId]} must be reported or say why not`)
          continue
        }
        if (form.state === 'computed') {
          if (typeof form.value !== 'number' || !Number.isFinite(form.value)) {
            fail(`${path}.value`, 'not a finite number')
          }
          if (typeof form.unit !== 'string' || form.unit === '') {
            fail(`${path}.unit`, 'C4-OUT-03 requires a unit attached to every quantity')
          }
          if (typeof form.underflowed !== 'boolean') {
            fail(`${path}.underflowed`, 'missing: a zero that is not the value must be marked')
          }
        } else if (form.state === 'not-computable' || form.state === 'withheld') {
          if (typeof form.reason !== 'string' || !form.reason) {
            fail(
              `${path}.reason`,
              'missing: C4-UN-05 requires an uncomputable form to be reported as such, not as zero or blank',
            )
          }
        } else {
          fail(`${path}.state`, 'not one of computed, not-computable, withheld')
        }
      }
    })
  }

  if (typeof o.series?.generationMethod !== 'string' || !o.series.generationMethod) {
    fail('series.generationMethod', 'missing: C4-IV-06 requires the method to be stated')
  }

  const minimum = o.declarations?.pipettingMinimum
  if (typeof minimum?.value !== 'number') fail('declarations.pipettingMinimum.value', 'missing')
  if (minimum?.provenance !== 'entered' && minimum?.provenance !== 'default') {
    fail(
      'declarations.pipettingMinimum.provenance',
      'missing: C4-SR-05 requires whether the minimum was entered or defaulted',
    )
  }
  if (typeof o.declarations?.cellDensity?.value !== 'number') {
    fail('declarations.cellDensity', 'missing: C4-SC-04 requires it on the output')
  }
  if (typeof o.declarations?.stockSource !== 'string' || !o.declarations.stockSource) {
    fail('declarations.stockSource', 'missing: C4-AB-04 makes it required')
  }

  if (!Array.isArray(o.flags)) {
    fail('flags', 'missing: an empty array is the no-flags case and is not the same as absent')
  } else {
    o.flags.forEach((f: any, i: number) => {
      if (!/^C4-FL-(0[1-9]|1[01])$/.test(f?.code ?? '')) {
        fail(`flags[${i}].code`, 'not a machine-readable reason code')
      }
      if (typeof f?.message !== 'string' || !f.message) fail(`flags[${i}].message`, 'missing')
      if (!['threshold', 'declaration', 'import'].includes(f?.kind)) fail(`flags[${i}].kind`, 'missing')
    })
  }

  if (o.displayed?.significantFigures !== DISPLAY_SIG_FIGS) {
    fail('displayed.significantFigures', 'not the displayed precision')
  }
  if (o.displayed?.roundingMode !== ROUNDING_MODE) fail('displayed.roundingMode', 'not stated')

  if (!Array.isArray(o.derivation?.relations) || o.derivation.relations.length === 0) {
    fail('derivation.relations', 'missing: C4-DT-02')
  }
  for (const key of [
    'scope',
    'precision',
    'stainingVolume',
    'dilutionConvention',
    'determinesNotVerifies',
    'thresholdEvaluation',
  ]) {
    if (typeof o.statements?.[key] !== 'string' || !o.statements[key]) {
      fail(`statements.${key}`, 'missing')
    }
  }

  return problems
}
