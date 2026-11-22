// @ts-check
import { defineConfig } from 'astro/config'

// English is the default at `/`; Chinese is at `/zh/`. The legacy English path also has
// a static redirect fallback; public/_redirects supplies the HTTP redirect on Cloudflare Pages.
export default defineConfig({
  site: 'https://agentshed.aloongplanet.com',
  redirects: { '/en': '/' },
  i18n: {
    defaultLocale: 'en',
    locales: ['zh', 'en'],
    routing: { prefixDefaultLocale: false }
  },
  // The dev server's way to the download count's file (src/download-count.ts, DEV_COUNT_PATH): the download host
  // answers CORS for the landing page's origin only, so the page served from localhost reads it from its own origin
  vite: {
    server: {
      proxy: {
        '/__download-count': {
          target: 'https://dl.agentshed.aloongplanet.com',
          changeOrigin: true,
          rewrite: () => '/stats/downloads.json'
        }
      }
    }
  }
})
