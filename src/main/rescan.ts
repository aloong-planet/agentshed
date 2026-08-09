// token-stats sequence E: the pure function layer of the snapshot's automatic refresh.
// The trigger wiring (timers and focus events) lives in the index.ts assembly layer; this only carries
// the unit-testable judgements.

/** The throttle judgement for a focus trigger (E1): never scanned means scan; otherwise scan again only
 * once the throttle window has passed since the last successful scan */
export function shouldRescanOnFocus(
  nowMs: number,
  lastScanMs: number | null,
  throttleMs: number
): boolean {
  if (lastScanMs === null) return true
  return nowMs - lastScanMs >= throttleMs
}

/** Parsing injected time parameters (E5): a valid positive number is taken, otherwise the default —
 * bad input must not bring the refresh to a halt */
export function rescanIntervalMs(env: string | undefined, fallbackMs: number): number {
  const n = Number(env)
  return Number.isFinite(n) && n > 0 ? n : fallbackMs
}
