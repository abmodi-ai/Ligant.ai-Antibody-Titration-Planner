/**
 * The privacy disclosure.
 *
 * Shared across the bench tools rather than duplicated, because privacy is the
 * product's central claim. Two copies would drift, and a tool that quietly
 * lacked this section would undercut the claim everywhere else.
 *
 * Every storage key the tool writes is named here. scripts/check-network.mjs
 * reads every key the page actually writes and fails the build unless each one
 * appears verbatim inside a `code` element, so a key that is written but not
 * disclosed cannot ship.
 */
import { NETWORK_CLAIM_VERIFIED } from '../../lib/site'

interface Props {
  storageKeys: readonly string[]
  onClearStorage: () => void
}

export function PrivacyPanel({ storageKeys, onClearStorage }: Props) {
  return (
    <>
      <h3>Privacy</h3>
      <p>
        Everything on this page is computed in your browser. Nothing you enter is transmitted, and
        the page contacts no third party at all: the typefaces are served from this origin, there is
        no analytics script, and the code contains no network call of any kind.
      </p>
      <p>
        {NETWORK_CLAIM_VERIFIED ? (
          <>
            That has been checked against this deployed address in a real browser, with the network
            monitor started before the page loaded.
          </>
        ) : (
          <>
            That is checked two ways on every build: a scan that fails the build if any external
            address appears in the source or the bundle, and a real browser driven over the built
            artefact that fails if the page requests anything from another origin. Both checks are
            on the build. What no check here can see is anything a host inserts into a response
            afterwards, which is a real failure mode rather than a hypothetical one. Whoever deploys
            this is the only party positioned to check for that, and this page does not claim it has
            been done.
          </>
        )}
      </p>
      <p>Stored in this browser, and nowhere else:</p>
      <ul>
        {storageKeys.map((key) => (
          <li key={key}>
            <code>{key}</code> holds the declarations currently on screen, so that a page reload
            does not discard work in progress. Anything restored from it is marked as retained until
            you confirm it.
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button type="button" onClick={onClearStorage}>
          Clear stored data
        </button>
      </div>
    </>
  )
}
