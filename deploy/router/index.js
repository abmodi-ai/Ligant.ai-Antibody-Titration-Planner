// Router for the Antibody Titration Planner, at benchtools.ligant.ai.
//
// The same shape as ligant-molarity-converter-router and
// ligant-antigen-density-calculator-router: strip the path prefix and proxy to
// the tool's own Pages project, so each tool deploys independently while the
// suite keeps one origin.
const UPSTREAM_HOST = 'ligant-antibody-titration-planner.pages.dev'
const PREFIX = '/antibody-titration-planner'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === PREFIX) {
      return Response.redirect(`${url.origin}${PREFIX}/${url.search}`, 301)
    }
    if (!url.pathname.startsWith(`${PREFIX}/`)) {
      return fetch(request)
    }

    const upstream = new URL(request.url)
    upstream.hostname = UPSTREAM_HOST
    upstream.pathname = url.pathname.slice(PREFIX.length) || '/'

    const headers = new Headers(request.headers)
    headers.delete('host')

    return fetch(
      new Request(upstream, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'follow',
        // The upstream's own headers (e.g. Content-Type on /LICENSE) govern
        // caching, not a second layer here: a proxy that caches independently
        // of the origin can keep serving what the origin said before its last
        // deploy, which is exactly the kind of staleness this route exists to
        // avoid introducing.
        cf: { cacheTtl: 0, cacheEverything: false },
      }),
    )
  },
}
