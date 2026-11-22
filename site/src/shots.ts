// The landing page's screenshots (landing-page::REQ-005), the files under public/shots/. Where each cut's data
// comes from, and when it was approved or retaken, is in site/README.md.
import type { Locale } from './i18n/ui'

/** The features section's views, in the order of its steps (landing-page::US-003/AC-01) */
export const FEATURE_SHOTS = ['overview', 'project', 'memory', 'tokens', 'session', 'search'] as const

/** Every feature cut: 920×517pt (16:9) at 2×, one size so the text keeps one size as the steps turn */
export const FEATURE_SIZE = { width: 1840, height: 1035 } as const

export const shotSrc = (name: string, locale: Locale): string => `/shots/${name}-${locale}.png`
