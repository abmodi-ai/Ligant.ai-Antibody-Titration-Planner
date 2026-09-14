/**
 * A numbered declaration panel that collapses once it has been answered.
 *
 * WHY THIS EXISTS. C4-NF-03 requires the inputs and the full series to fit one
 * screen without scrolling. Measured at twelve points with the full v0.4 input
 * set, the input column alone reaches about 1700px, and it reaches that height
 * WHATEVER THE POINT COUNT IS, because it is made of twelve fields and their
 * declarations rather than of the series. The remedy URS open item 7 prescribes,
 * reducing the point cap, therefore cannot close the gap on its own: at two
 * points the column is exactly as tall as at twelve.
 *
 * The other remedy the URS forbids is dropping a declaration, and rightly: the
 * declarations are the tool.
 *
 * So the declarations stay and the SPACE THEY OCCUPY WHEN ALREADY ANSWERED goes.
 * A completed panel collapses to its heading plus a summary of what was
 * declared, so every value remains on screen and readable, and reopens on a
 * click. Nothing is hidden: a collapsed panel shows its answers, not a tick.
 *
 * THE GROUND RULE IS PRESERVED. Method is chosen before data entry, and the
 * panels are ordered so that a user cannot reach a computation without having
 * passed every declaration. Collapsing happens only AFTER a panel is complete,
 * so it can never carry a user past a declaration they have not made.
 */
import { useState, type ReactNode } from 'react'

interface Props {
  step: number
  title: string
  /** The declared values, shown in place of the fields when collapsed. */
  summary: string | null
  /**
   * True once every declaration in this panel has an answer AND the series has
   * been computed.
   *
   * Waiting for the series matters. Several declarations have a legitimate
   * default that is also a real answer, "no vendor recommendation used" among
   * them, so a panel judged complete the moment it is first rendered would
   * collapse before the reader had seen it. Nothing collapses until there is a
   * result to collapse in favour of.
   */
  complete: boolean
  children: ReactNode
}

export function DeclarationPanel({ step, title, summary, complete, children }: Props) {
  // Null until the reader expresses a preference, after which theirs wins. A
  // panel the reader deliberately opened must not close itself again.
  const [open, setOpen] = useState<boolean | null>(null)
  const expanded = open ?? !complete

  return (
    <section className={expanded ? 'panel' : 'panel panel-collapsed'}>
      <div className="panel-head">
        <div className="titles">
          <span className="step">{step}</span>
          <h2>{title}</h2>
        </div>
        {complete && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setOpen(!expanded)}
            className="disclose"
          >
            {expanded ? 'Collapse' : 'Change'}
          </button>
        )}
      </div>
      {expanded ? (
        <div className="panel-body stack" style={{ gap: 14 }}>
          {children}
        </div>
      ) : (
        <div className="panel-body panel-summary">{summary}</div>
      )}
    </section>
  )
}
