// The total limit on kept turns (session-view, the in-turn fetch states; ADR-0053, owner's choice 2026-11-17): the turns
// kept in the display copy, and in the renderer's memory, together stay within 128 Mi UTF-16 units of their serialised
// form. The copy is read back at launch as one string, whose cap is about 512 Mi units, and a failed read loses every
// saved page; the per-turn keep size alone bounds no number of turns. When a newly kept turn does not fit, the earliest
// fetched leave first until it does. The main process and the renderer decide with these same functions, the renderer
// taking the main process's limit through its launch argument.
import type { SessionTurn } from './domain'
import { KEPT_TURNS_ARG } from './ipc'

/** 128 Mi UTF-16 units: kept turns' serialised forms together fit exactly this, one unit more does not */
export const KEPT_TURNS_UNITS = 128 * 1024 * 1024

/** A kept turn's measure against the total: the length of its serialised form, in UTF-16 units */
export function keptTurnUnits(turn: SessionTurn): number {
  return JSON.stringify(turn).length
}

/**
 * Which kept turns leave so that one of `units` fits: `kept` holds each kept turn's key and measure, earliest fetched
 * first, the new turn's own key not among them. The earliest leave first, only until it fits; null when it is over the
 * limit alone, and then nothing leaves and it is not kept.
 */
export function turnsToRelease(kept: readonly (readonly [string, number])[], units: number, limit: number): string[] | null {
  if (units > limit) return null
  let total = units
  for (const [, u] of kept) total += u
  const out: string[] = []
  for (const [key, u] of kept) {
    if (total <= limit) break
    out.push(key)
    total -= u
  }
  return out
}

/** The limit the main process passed in the renderer's launch arguments; 128 Mi units when absent or not positive */
export function keptTurnsUnitsArg(argv: readonly string[]): number {
  const raw = argv.find((a) => a.startsWith(KEPT_TURNS_ARG))?.slice(KEPT_TURNS_ARG.length)
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : KEPT_TURNS_UNITS
}
