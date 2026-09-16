/**
 * A numbered declaration panel that collapses once it has been answered.
 *
 * WHY THIS EXISTS. Measured at twelve points with the full input set, the
 * input column alone reaches about 1700px WHATEVER THE POINT COUNT IS,
 * because it is made of twelve fields and their declarations rather than of
 * the series; reducing the point cap therefore cannot close that gap on its
 * own, at two points the column is exactly as tall as at twelve. Dropping a
 * declaration is not an option either: the declarations are the tool.
 *
 * So the declarations stay and the SPACE THEY OCCUPY WHEN ALREADY ANSWERED
 * goes. A completed panel collapses to its heading plus a summary of what was
 * declared, so every value remains on screen and readable, and reopens on a
 * click. Nothing is hidden: a collapsed panel shows its answers, not a tick.
 *
 * C4-NF-03, restated at v0.5, is the reason this collapse has to hold up under
 * scrolling and not just under a static screenshot: a series point is never
 * read apart from the declarations and flags it was designed under. This
 * panel lives in `.stack`, a column the sticky rail (the series, the flags)
 * does not travel with, so its collapsed summary being on screen proves
 * nothing about what is on screen once the reader has scrolled past it. The
 * `retained` badge here is a courtesy for the column the reader is actually
 * looking at; the property NF-03 requires is carried by `.rail-declarations`
 * in `SeriesTable.tsx`, which repeats these same values inside the rail.
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
  /**
   * True if any field in this panel still holds a value carried over from a
   * previous session and not yet confirmed or edited in this one. Shown only
   * while collapsed: an expanded panel already marks the field itself.
   */
  retained?: boolean
  /**
   * Stand behind every unconfirmed value in this panel at once.
   *
   * The gap that made the marker feel like noise rather than information:
   * editing a field cleared its own mark, so a reader who had checked a
   * restored declaration and found it correct had no way to say so, and the
   * only route to a clean form was to retype values that were already right.
   * Absent where the panel has nothing outstanding, rather than rendered as
   * a control that would do nothing.
   */
  onConfirm?: () => void
  /**
   * Shown once, above the fields, on the first panel carrying anything from
   * a previous visit. Not repeated per panel: the explanation is the same
   * everywhere, and repeating it is how a page teaches a reader to skip it.
   */
  note?: ReactNode
  children: ReactNode
}

export function DeclarationPanel({
  step,
  title,
  summary,
  complete,
  retained = false,
  onConfirm,
  note,
  children,
}: Props) {
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
          {!expanded && retained && <span className="retained-marker">from your last visit</span>}
        </div>
        <div className="panel-head-actions">
          {onConfirm && (
            <button type="button" className="confirm-values" onClick={onConfirm}>
              Confirm these values
            </button>
          )}
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
      </div>
      {expanded ? (
        <div className="panel-body stack" style={{ gap: 14 }}>
          {note}
          {children}
        </div>
      ) : (
        <div className="panel-body panel-summary">
          {note}
          {summary}
        </div>
      )}
    </section>
  )
}
