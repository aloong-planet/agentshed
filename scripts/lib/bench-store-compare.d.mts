// Types for bench-store-compare.mjs, which scripts/bench-scan.entry.ts imports
export interface StoreRow {
  path: string
  sig: string
  agg: string
  resume: string | null
}
export interface StoreVerdict {
  entries: number
  disagreeing: string[]
  onlyInMainThread: string[]
  onlyInPool: string[]
  changed: string[]
  fails: boolean
}
export function compareStores(mainThread: readonly StoreRow[], pool: readonly StoreRow[]): StoreVerdict
