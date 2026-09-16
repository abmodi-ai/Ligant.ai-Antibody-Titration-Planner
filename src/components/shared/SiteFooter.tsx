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
 * THE PRIVACY PARAGRAPHS ARE PLAIN LANGUAGE, DELIBERATELY, for a reader who is
 * not going to read the technical privacy section elsewhere on the page.
 * "We do count visits" is server-side hosting-provider traffic logging, a fact
 * about the infrastructure rather than something this page's own code does; it
 * does not conflict with "no third-party code of any kind", which is a claim
 * about what runs on the page itself.
 *
 * THE ONE CLAUSE STILL GATED is "no third-party code ... runs on this page",
 * and only that clause: C4-NF-01 is an environment claim about the SERVED page
 * and acceptance 17 is the only thing that can establish it, since a local
 * server over dist/ does not exercise the host or its CDN. So the unqualified
 * form is shown only once NETWORK_CLAIM_VERIFIED has been set, which is a
 * deployment step; until then the page says what is actually established,
 * which is narrower. An accurate narrower claim is worth more than an
 * unverified broader one.
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
import { SCOPE_STATEMENT } from '../../lib/flags'

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
            Your data stays in your browser. Everything you enter into this tool is calculated on
            your own device and never sent anywhere. We do not see it, store it, or have any way to
            retrieve it. Closing the page ends it.
          </p>
          <p>
            There is no account and no tracking of you. No login, no sign up, no cookies for
            advertising, no analytics scripts, and no third-party code of any kind{' '}
            {NETWORK_CLAIM_VERIFIED ? (
              <>runs on this page, confirmed against the page as served, not only against the code.</>
            ) : (
              <>
                is in the code we publish, confirmed by scanning it and running it in a real browser.
                The page as served has not yet been checked the same way.
              </>
            )}
          </p>
          <p>
            We do count visits. Our hosting provider records basic traffic: which pages get opened,
            how often, and roughly where in the world from. Because we collect nothing about who you
            are, this is the only signal we have about whether these tools are useful and which one
            to build next.
          </p>
          <p>
            Ligant Bench Tools are free and open source under Apache 2.0.
            {REPO_URL && (
              <>
                {' '}
                Every figure on this page comes from code you can read, download or run yourself, at{' '}
                <a href={REPO_URL}>{REPO_URL.replace('https://', '')}</a>.
              </>
            )}{' '}
            <strong>{SCOPE_STATEMENT}</strong>
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
