/**
 * The method panel, and the disclosures the specification puts on the page
 * rather than in a document.
 *
 * Four things here are requirements and not copy, and each is tested:
 *
 *   C4-FC-01   the fourteen failure classes this tool cannot detect
 *   C4-CN-01   the constants and conventions register, with basis and status
 *   C4-OUT-07/10/11  the three convention statements
 *   C4-OUT-02  the derivation, with every declaration in it
 *
 * The lists render from the exported data in `flags.ts`. Nothing here keeps a
 * second copy, so the page cannot describe a threshold the tool does not apply,
 * nor omit one it does.
 */
import type { SeriesResult } from '../lib/compute'
import { PrivacyPanel } from './shared/PrivacyPanel'
import {
  CONSTANTS_REGISTER,
  DETERMINES_NOT_VERIFIES_STATEMENT,
  DILUTION_CONVENTION_STATEMENT,
  PRECISION_PRINCIPLE,
  STAINING_VOLUME_STATEMENT,
  THRESHOLD_EVALUATION_STATEMENT,
  UNDETECTABLE_FAILURES,
} from '../lib/flags'
import { PRECISION_STATEMENT } from '../lib/format'
import { INTEGRITY_SCOPE_STATEMENT } from '../lib/transport'
import { RETENTION_STATEMENT } from '../lib/retention'
import { URS_VERSION } from '../lib/site'

/** Turns the corpus convention `*emphasis*` into markup at render time. */
function withEmphasis(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
      <strong key={i}>{part.slice(1, -1)}</strong>
    ) : (
      part
    ),
  )
}

interface Props {
  result: SeriesResult | null
  storageKeys: readonly string[]
  onClearStorage: () => void
}

export function Method({ result, storageKeys, onClearStorage }: Props) {
  return (
    <section className="panel method-panel">
      <div className="panel-head">
        <div className="titles">
          <h2>Method, conventions and limits</h2>
        </div>
      </div>
      <div className="panel-body prose">
        <h3>What this tool determines</h3>
        <p>
          The antibody concentration at each point of a titration series, expressed in every form
          the bench and the method record require, for a staining volume and a cell number you
          declare. It does not prepare the series, does not analyse the resulting data, does not
          choose the optimal point, and does not determine whether any point saturates the target.
        </p>
        <p>
          <strong>{DETERMINES_NOT_VERIFIES_STATEMENT}</strong>
        </p>

        <h3>Why the declarations are compelled</h3>
        <p>
          How much antibody binds depends on the free antibody concentration and, where the antigen
          sink is significant, on the amount of antibody available per cell. Which of the two
          governs depends on antigen density, affinity and cell number, none of which a datasheet
          states. A recommendation of "5 µL per test" carries neither quantity unless the volume and
          the cell number of that test are also stated.
        </p>
        <p>
          A lab that titrates in 100 µL and stains in 50 µL has doubled the concentration and will
          not see it, because the volume pipetted is identical. A lab that titrates at 1 × 10⁶ cells
          and stains at 5 × 10⁶ has cut the amount per cell fivefold and will not see that either. A
          spreadsheet returns a clean list of volumes in both cases and records none of the context
          that makes them wrong.
        </p>

        <h3>Conventions</h3>
        <ul>
          <li>{STAINING_VOLUME_STATEMENT}</li>
          <li>{DILUTION_CONVENTION_STATEMENT}</li>
          <li>{PRECISION_STATEMENT}</li>
          <li>{THRESHOLD_EVALUATION_STATEMENT}</li>
          <li>{RETENTION_STATEMENT}</li>
          <li>{INTEGRITY_SCOPE_STATEMENT}</li>
        </ul>

        {result !== null && (
          <>
            <h3>Derivation</h3>
            <p>The relations applied to produce the series on this page:</p>
            <ul>
              {result.relations.map((relation) => (
                <li key={relation}>{relation}</li>
              ))}
            </ul>
            <p className="hint">{result.generationMethod}</p>
          </>
        )}

        <h3>Failure classes this tool cannot detect</h3>
        <p>
          The tool guarantees that the series arithmetic is correct and that the staining volume,
          cell number, recommendation basis, stock mass basis and pipetting minimum are recorded. It
          cannot detect any of the following.
        </p>
        <ul>
          {UNDETECTABLE_FAILURES.map((failure) => (
            <li key={failure}>{withEmphasis(failure)}</li>
          ))}
        </ul>

        <h3>Constants and conventions</h3>
        <p>
          Every threshold at which this tool changes behaviour, and every convention under which a
          value is interpreted, with its value and its basis. Thresholds chosen by inspection are
          stated as such, and those still to be derived say so.
        </p>
        <p>
          The principle these follow, recorded for the tool set from C1 onward:{' '}
          <em>{PRECISION_PRINCIPLE}</em>
        </p>
        <div className="table-scroll">
          <table className="register-table">
            <caption>Constants and conventions register</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Value</th>
                <th scope="col">Basis</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {CONSTANTS_REGISTER.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row">{entry.label}</th>
                  <td>{entry.value}</td>
                  <td>{entry.basis}</td>
                  <td className="prose-cell">{entry.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PrivacyPanel storageKeys={storageKeys} onClearStorage={onClearStorage} />

        <h3>Specification</h3>
        <p className="hint">
          Built against C4 URS v{URS_VERSION}. References are given as text rather than as links:
          every byte of this page is served from this origin, and a link that navigated to a
          publisher would disclose a visit that the rest of the tool is built to prevent.
        </p>
      </div>
    </section>
  )
}
