// The screenshots (landing-page::REQ-005), taken from the built app, one set per language, in the light
// appearance: the hero and the overview, project, token and session cuts over the owner's own agent data,
// approved for publication (2026-10-13; the hero's retake 2026-10-21); the memory and search cuts over a made-up
// home with the same projects in both (the owner's choice, 2026-10-21). They ship as static files under
// public/shots/ with their pixel sizes declared, so their space is held before they load.
import type { Locale } from './i18n/ui'

/** The features section's views, in the order of its steps (landing-page::US-003/AC-01) */
export const FEATURE_SHOTS = ['overview', 'project', 'memory', 'tokens', 'session', 'search'] as const

/** The hero's screenshot: the whole window, at 2× */
export const HERO_SIZE = { width: 2560, height: 1536 } as const

/** Every feature cut: 920×517pt (16:9) at 2×, one size so the text keeps one size as the steps turn */
export const FEATURE_SIZE = { width: 1840, height: 1035 } as const

export const shotSrc = (name: string, locale: Locale): string => `/shots/${name}-${locale}.png`
