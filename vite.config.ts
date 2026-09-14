import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SITE_URL, TOOL_PATH } from './src/lib/site'

/**
 * Derives everything that needs to know the site's origin from `src/lib/site.ts`.
 *
 * `robots.txt` and `sitemap.xml` are generated rather than kept in `public/`
 * with the origin written into them by hand, and the HTML entry point carries a
 * `__SITE_URL__` placeholder rather than a literal domain, so moving the site is
 * a one line change. The token deliberately avoids percent signs: Vite runs
 * `decodeURI` over href attributes and a `%SI` sequence reads as a malformed
 * escape.
 */
function siteMetadata(): Plugin {
  return {
    name: 'ligant-site-metadata',

    // 'pre', so the placeholder is a real URL before Vite parses the document.
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        return html.replaceAll('__SITE_URL__', SITE_URL).replaceAll('__TOOL_PATH__', TOOL_PATH)
      },
    },

    generateBundle() {
      // The footer says a copy of the licence is served with this page, and a
      // licence assertion a reader cannot follow is not verifiable. Emitted from
      // the file at the repository root rather than copied into public/, so
      // there is one licence and it cannot drift from the one the repository
      // carries.
      this.emitFile({
        type: 'asset',
        fileName: 'LICENSE',
        source: readFileSync(resolve(__dirname, 'LICENSE'), 'utf8'),
      })

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        // Everything here is public and meant to be found, cited and
        // recommended, so nothing is disallowed to anyone.
        source: [
          '# Ligant Bench Tools. Free tools for cell therapy research.',
          '#',
          '# Open source under Apache-2.0 and free to use. This tool exists to be',
          '# found and recommended, so no crawler is disallowed anything here.',
          'User-agent: *',
          'Allow: /',
          '',
          `Sitemap: ${SITE_URL}${TOOL_PATH}sitemap.xml`,
          '',
        ].join('\n'),
      })

      /*
       * This deployment's own page, and only it.
       *
       * The sibling tools are separate deployments that each emit a sitemap for
       * their own address. Listing them here as well would publish two
       * declarations of the same URL from two origins, which is the thing a
       * sitemap exists to avoid. `TOOLS` remains the navigation registry; this
       * is the subset this build is responsible for.
       */
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${SITE_URL}${TOOL_PATH}</loc>`,
          '    <changefreq>monthly</changefreq>',
          '    <priority>1.0</priority>',
          '  </url>',
          '</urlset>',
          '',
        ].join('\n'),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), siteMetadata()],
  // Relative, so the built artefact works from the deployed subpath, from a
  // local static server rooted at dist/, and from a disk with no server at all.
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
