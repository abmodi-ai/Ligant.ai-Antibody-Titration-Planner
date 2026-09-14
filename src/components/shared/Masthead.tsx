import type { ReactNode } from 'react'
import { LigantLockup } from '../LigantMark'
import { TOOLS, TOOL_PATH } from '../../lib/site'

/**
 * The page's identity, and the way out of it.
 *
 * This tool is the first in the set with siblings to link, so it is the first
 * to render the tool-switcher pills the shared stylesheet has carried since
 * before there was a second tool. The current tool is a `span` rather than an
 * `a`: there is no link to the page you are already on, and the stylesheet
 * matches on the attribute rather than the element for exactly that reason.
 *
 * C4-NF-05 requires this tool to be reachable and usable at its own address
 * independently of any other, including without C1 and C3. These links are a
 * convenience for a reader, not a dependency: nothing on this page loads from
 * them, and the tool works with every one of them broken.
 */
interface Props {
  title: string
  children: ReactNode
}

export function Masthead({ title, children }: Props) {
  return (
    <header className="masthead">
      <div>
        <LigantLockup />
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      <div className="tool-nav">
        <ul>
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              {tool.path === TOOL_PATH ? (
                <span aria-current="page">{tool.name}</span>
              ) : (
                <a href={tool.path}>{tool.name}</a>
              )}
            </li>
          ))}
        </ul>
        <span className="eyebrow suite-mark">Bench Tools</span>
      </div>
    </header>
  )
}
