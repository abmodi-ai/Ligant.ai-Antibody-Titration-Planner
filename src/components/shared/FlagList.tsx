/**
 * How a flag is rendered.
 *
 * AMBER, ALWAYS. A flag is the human decision moment, which is what amber means
 * in this palette. Red is reserved for the tool itself failing, and a series
 * the reader has to think about is not the tool failing. There is deliberately
 * no severity here and no `.flag.error`: section 8 says flags never block the
 * determination, so there is no second level for one to be promoted to.
 *
 * WHAT DISTINGUISHES A FLAGGED VALUE FROM A WITHHELD ONE is the PRESENCE OR
 * ABSENCE OF THE NUMBER, never the colour. A flagged point keeps its number and
 * gains one of these blocks; a withheld form loses its number and the reason
 * takes its place, in the series table. Both are amber because both are the
 * scientist's decision.
 */
import type { Flag } from '../../lib/flags'

function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5 15 14H1L8 1.5Z" fill="var(--brand-amber)" />
      <path d="M8 6v3.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.9" fill="#fff" />
    </svg>
  )
}

/**
 * D2, Nadira's second review. Code plus one line, inside `.series-sticky`.
 *
 * At four flags the full-text `FlagList` alone measured 669px at a 947px
 * viewport, taller than the 650px reference viewport, with no declaration
 * line in view: the block has to stop growing with flag count, and this is
 * the half of the fix that lives here rather than in the layout. Each entry
 * is a `<details>` so the reason is one click away without leaving the
 * sticky block; the full text is ALSO repeated in a `FlagList` below the
 * table, per Nadira's own instruction, so a reader who has scrolled past the
 * sticky block is not sent back up to read it.
 */
export function FlagSummaryList({ flags }: { flags: readonly Flag[] }) {
  if (flags.length === 0) return null
  return (
    <ul className="flag-summary-list">
      {flags.map((flag) => (
        <li key={flag.code}>
          <details className="flag-summary">
            <summary>
              <strong>{flag.code}</strong>: {flag.summary}
            </summary>
            <span>
              {flag.message}
              {flag.remedy && <span className="flag-remedy">{flag.remedy}</span>}
            </span>
          </details>
        </li>
      ))}
    </ul>
  )
}

export function FlagList({ flags }: { flags: readonly Flag[] }) {
  if (flags.length === 0) return null
  return (
    <>
      {flags.map((flag) => (
        <div className="flag" key={flag.code}>
          <FlagIcon />
          <span>
            {/*
              The reason code is shown, not hidden. It is the machine-readable
              identifier section 8 requires, it is what the structured object
              carries, and a user reporting a problem can quote it.
            */}
            <strong>{flag.code}</strong>{' '}
            {flag.message}
            {flag.remedy && <span className="flag-remedy">{flag.remedy}</span>}
          </span>
        </div>
      ))}
    </>
  )
}

/**
 * A section 7 rejection, shown against the field it is about.
 *
 * `.flag` and NOT `.flag.error`, deliberately. A user who typed a negative cell
 * count has not broken anything, and red would tell them they had.
 */
export function RejectionList({
  rejections,
}: {
  rejections: readonly { code: string; message: string }[]
}) {
  if (rejections.length === 0) return null
  return (
    <>
      {rejections.map((rejection) => (
        <div className="flag" key={rejection.code + rejection.message}>
          <FlagIcon />
          <span>
            <strong>{rejection.code}</strong>{' '}
            {rejection.message}
          </span>
        </div>
      ))}
    </>
  )
}
