// @ts-check
import { defineConfig } from 'astro/config'

// Agentshed's landing page (landing-page spec). Chinese is the default language at `/`, English is under
// `/en`, as on Transfer's site.
export default defineConfig({
  site: 'https://agentshed.aloongplanet.com',
  i18n: {
    defaultLocale: 'zh',
    locales: ['zh', 'en'],
    routing: { prefixDefaultLocale: false }
  }
})
