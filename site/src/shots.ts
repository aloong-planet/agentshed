// The screenshots (landing-page::REQ-005): taken from the built app over the owner's own agent data and
// approved for publication on 2026-10-13, one set per language, in the light appearance. They ship as static
// files under public/shots/ with their pixel sizes declared, so their space is held before they load.
import type { Locale } from './i18n/ui'

/** The features section's four views, in the order of its steps (landing-page::US-003/AC-01) */
export const FEATURE_SHOTS = ['overview', 'project', 'tokens', 'session'] as const

/** The hero's screenshot: the whole window, at 2× */
export const HERO_SIZE = { width: 2560, height: 1536 } as const

/** Every feature cut: 920×517pt (16:9) at 2×, one size so the frame's text keeps one size as it switches */
export const FEATURE_SIZE = { width: 1840, height: 1035 } as const

export const shotSrc = (name: string, locale: Locale): string => `/shots/${name}-${locale}.png`
