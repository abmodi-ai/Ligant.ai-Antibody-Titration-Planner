import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Emits one self-contained HTML file (dist-single/index.html) for a reader who
// wants to run this from a disk with no server and no network. Functionally
// identical to the normal build; it carries no emitted LICENSE, robots.txt or
// sitemap.xml, and its meta tags keep their unsubstituted placeholders, so
// scripts/check-network.mjs deliberately never inspects it.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
})
