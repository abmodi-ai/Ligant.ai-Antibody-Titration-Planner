/**
 * The result.
 *
 * There is no hero number here and one must not be invented. C4 determines a
 * SERIES, and the table is the answer: picking one point out of it to enlarge
 * would be choosing the optimum, which is exactly what section 1 says this tool
 * does not do.
 *
 * THE THREE STATES A CELL CAN BE IN are built rather than styled, and what
 * separates them is the presence or absence of the number:
 *
 *   a value          the number, in IBM Plex Mono, tabular figures
 *   not computable   the words "not computable", in Inter. Never zero, never
 *                    blank, never an estimate
 *   withheld         the word "withheld", in Inter. Never greyed, never struck
 *                    through, never a dash
 *
 * Dropping the numeral face is the whole mechanism, and it is borrowed from the
 * Antigen Density Calculator's suppressed hero value, which "drops the numeral
 * face and the numeric scale rather than sitting where a figure would be read".
 * A reader scanning the column sees immediately that nothing there is a number.
 *
 * THE COLUMN HEADER STILL RENDERS for a withheld form, so the reader can see
 * that the form was considered and declined rather than never offered. The
 * reason is given once below the table rather than repeated down twelve rows,
 * because it is a property of the series and not of any point.
 */
import type { SeriesResult } from '../lib/compute'
import { formatSigFigs } from '../lib/format'
import type { FormValue } from '../lib/forms'
import { FORMS, FORM_LABEL, UNIT_LABEL, type FormId } from '../lib/units'

/** The column heading for each form: the unit where there is one, the name where there is not. */
const FORM_HEADING: Readonly<Record<FormId, string>> = {
  1: 'µL / test',
  2: 'µg / test',
  3: 'µg/mL',
  4: '1 in',
  5: 'µg / 10⁶ cells',
  6: 'mol/L',
}

function Cell({ form }: { form: FormValue }) {
  if (form.state === 'computed') return <>{formatSigFigs(form.value)}</>
  // Inter rather than Plex Mono: this is a statement, not a number, and it must
  // not sit where a figure would be read.
  return <span className="absent">{form.state === 'withheld' ? 'withheld' : 'not computable'}</span>
}

export function SeriesTable({ result }: { result: SeriesResult }) {
  const flaggedPoints = new Set(result.flags.flatMap((f) => f.points ?? []))
  const showVendorMultiple = result.points.some((p) => p.vendorMultiple !== null)
  const multiplesDiffer = result.points.some((p) => p.vendorMultiple?.identical === false)

  // One note per form that has no value, taken from the first point, because
  // the reason is a property of the series rather than of any one point.
  const absentForms = FORMS.map((id) => ({ id, form: result.points[0].forms[id] })).filter(
    (entry): entry is { id: FormId; form: Extract<FormValue, { state: 'not-computable' | 'withheld' }> } =>
      entry.form.state !== 'computed',
  )

  return (
    <>
      <div className="table-scroll">
        <table className="series-table">
          <caption>
            The titration series, in every form computable from the declarations, at{' '}
            {formatSigFigs(result.normalised.stainingVolumeUl)} µL and{' '}
            {formatSigFigs(result.normalised.cells)} cells
          </caption>
          <thead>
            <tr>
              <th scope="col">Point</th>
              {FORMS.map((id) => (
                <th scope="col" key={id} title={FORM_LABEL[id]}>
                  {FORM_HEADING[id]}
                </th>
              ))}
              {showVendorMultiple && (
                <>
                  <th scope="col" title="Multiple of the vendor recommendation at the vendor's own test volume">
                    {multiplesDiffer ? 'x rec, vendor vol' : 'x rec'}
                  </th>
                  {multiplesDiffer && (
                    <th scope="col" title="Multiple of the vendor's stated amount placed in this staining volume">
                      x rec, this vol
                    </th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {result.points.map((point) => (
              <tr key={point.index} className={flaggedPoints.has(point.index) ? 'point-flagged' : undefined}>
                <th scope="row">{point.index}</th>
                {FORMS.map((id) => (
                  <td key={id} className="num">
                    <Cell form={point.forms[id]} />
                  </td>
                ))}
                {showVendorMultiple && (
                  <>
                    <td className="num">
                      {point.vendorMultiple ? formatSigFigs(point.vendorMultiple.atVendorTestVolume) : ''}
                    </td>
                    {multiplesDiffer && (
                      <td className="num">
                        {point.vendorMultiple ? formatSigFigs(point.vendorMultiple.atStainingVolume) : ''}
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {absentForms.length > 0 && (
        <ul className="form-notes">
          {absentForms.map(({ id, form }) => (
            <li key={id}>
              <b>
                Form {id}, {FORM_LABEL[id]}
              </b>
              {form.reason}
            </li>
          ))}
        </ul>
      )}

      {multiplesDiffer && (
        <p className="hint">
          The two vendor multiples differ because the staining volume differs from the vendor's
          stated test volume. The first compares each point against the concentration the vendor
          recommended in their own tube; the second against the concentration their stated amount
          would reach in yours.
        </p>
      )}
    </>
  )
}

/** C4-OUT-09. The series as a line a reader can paste into a notebook. */
export function notebookLine(result: SeriesResult): string {
  const points = result.points
    .map((point) => {
      const volume = point.forms[1]
      const concentration = point.forms[3]
      const parts = [`${point.index}:`]
      if (volume.state === 'computed') parts.push(`${formatSigFigs(volume.value)} ${UNIT_LABEL.uL}`)
      if (concentration.state === 'computed') {
        parts.push(`(${formatSigFigs(concentration.value)} ${UNIT_LABEL['ug/mL']})`)
      }
      return parts.join(' ')
    })
    .join('; ')

  const flags = result.flags.length > 0 ? ` Flags: ${result.flags.map((f) => f.code).join(', ')}.` : ''

  return (
    `Titration series, ${result.inputs.points} points, ${formatSigFigs(result.inputs.dilutionFactor)}-fold. ` +
    `Staining volume ${formatSigFigs(result.normalised.stainingVolumeUl)} ${UNIT_LABEL.uL} (final, including antibody), ` +
    `${formatSigFigs(result.normalised.cells)} cells. ` +
    `Points ${points}.${flags} ` +
    `Ligant Antibody Titration Planner ${result.engineVersion}. 3 sf, half away from zero.`
  )
}
