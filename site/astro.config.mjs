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
  }
})
