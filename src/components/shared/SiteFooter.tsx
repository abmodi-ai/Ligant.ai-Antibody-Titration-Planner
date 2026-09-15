/**
 * What this tool is, who publishes it, and under what terms.
 *
 * The citation is here rather than in the method section because it is the
 * thing a reader needs at the moment they decide to use a figure from this tool
 * in their own work, and that decision is made at the bottom of the page.
 *
 * The address and the email are plain text and a mailto link. Nothing here
 * contacts anything: a mailto is handled by the reader's own mail client and
 * fires no request, so the privacy claim is untouched.
 *
 * THE NETWORK CLAIM IS GATED. C4-NF-01 is an environment claim about the SERVED
 * page and acceptance 17 is the only thing that can establish it, since a local
 * server over dist/ does not exercise the host or its CDN. So the strong
 * sentence is shown only once NETWORK_CLAIM_VERIFIED has been set, which is a
 * deployment step; until then the page states the weaker thing that is actually
 * established. An accurate weaker claim is worth more than an unverified
 * stronger one.
 */
import { useState } from 'react'
import {
  APP_VERSION,
  CITATION_DOI,
  DEPLOYED_URL,
  NETWORK_CLAIM_VERIFIED,
  RELEASE_YEAR,
  REPO_URL,
  TOOL_NAME,
} from '../../lib/site'

/**
 * The citation, in three pieces, so what is shown and what is copied cannot
 * differ.
 */
const CITATION_LEAD = `Modi, A.B. (${RELEASE_YEAR}). `
const CITATION_TAIL =
  ` (${APP_VERSION}) [Computer software]. Ligant AI Incorporated. ${DEPLOYED_URL.replace('https://', '')}` +
  (CITATION_DOI !== null ? ` doi:${CITATION_DOI}` : '')

/**
 * One reference, with a control that takes it in a single action.
 *
 * `copied` is set only once the write resolves, not on click: a claim this
 * page makes about itself should be as accurate as every other one on it.
 */
function CitationRow() {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(CITATION_LEAD + TOOL_NAME + CITATION_TAIL)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // A browser may refuse clipboard access. The reference is on the page
      // and selectable regardless, so silence is better than an error the
      // reader cannot act on.
    }
  }

  return (
    <div className="footer-citation-row">
      <p>
        {CITATION_LEAD}
        <cite>{TOOL_NAME}</cite>
        {CITATION_TAIL}
      </p>
      <button type="button" onClick={copy} aria-label="Copy the software citation" aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-prose">
          <p>
            Ligant Bench Tools are free and open source under Apache 2.0, for research and
            educational use. They run entirely in your browser.
            {REPO_URL && (
              <>
                {' '}
                Every figure on this page comes from code you can read, download or run yourself, at{' '}
                <a href={REPO_URL}>{REPO_URL.replace('https://', '')}</a>.
              </>
            )}
          </p>
          <p>
            {NETWORK_CLAIM_VERIFIED ? (
              <>
                This page has been verified at its deployed address to contact no third party and to
                transmit nothing you enter.
              </>
            ) : (
              <>
                A static scan and a real browser confirm that the build contacts no third party and
                transmits nothing you enter. That check is on the build artefact. The deployed
                address has not yet been verified, and what a host inserts into a response
                afterwards is a real failure mode rather than a hypothetical one, so this page does
                not yet make the stronger claim.
              </>
            )}
          </p>
          <p>
            These tools are standalone calculators. If your lab needs more than they cover, please
            email us <a href="mailto:hello@ligant.ai">hello@ligant.ai</a>.
          </p>
        </div>

        <address className="footer-address">
          <span className="eyebrow">Ligant AI Incorporated</span>
          3675 Market Street
          <br />
          Suite 200
          <br />
          Philadelphia PA 19104
          <br />
          <a href="mailto:hello@ligant.ai">hello@ligant.ai</a>
        </address>
      </div>

      <div className="footer-citation">
        <span className="eyebrow">How to cite</span>
        <p className="footer-citation-note">Cite the software as below.</p>
        <CitationRow />
      </div>

      <p className="footer-licence">
        Licensed under the Apache License, Version 2.0. You may obtain a copy of the License in the{' '}
        <a href="LICENSE">
          <code>LICENSE</code>
        </a>{' '}
        file served with this page and distributed with the source. Unless required by applicable
        law or agreed to in writing, software distributed under the License is distributed on an "AS
        IS" basis, without warranties or conditions of any kind, either express or implied.{' '}
        <strong>Research use only. Not qualified for GxP decision-making.</strong>
      </p>
    </footer>
  )
}
