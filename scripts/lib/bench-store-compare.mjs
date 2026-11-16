// How the scan benchmark's workers mode (scripts/bench-scan.entry.ts) judges the token store a main-thread cold scan
// built against the one a parse-pool cold scan built. The two scans read the same files one after the other, so a file
// can change between them; its entry then carries another signature in each store, and that is no disagreement. Under
// one signature the two stores must hold the same entry, and an entry only one of them holds fails the run too: the
// pool dropped or invented a file.

/** @param {ReadonlyArray<{ path: string, sig: string, agg: string, resume: string | null }>} rows */
function byPath(rows) {
  return new Map(rows.map((r) => [r.path, r]))
}

/**
 * @param {ReadonlyArray<{ path: string, sig: string, agg: string, resume: string | null }>} mainThread
 * @param {ReadonlyArray<{ path: string, sig: string, agg: string, resume: string | null }>} pool
 */
export function compareStores(mainThread, pool) {
  const a = byPath(mainThread)
  const b = byPath(pool)
  const disagreeing = []
  const onlyInMainThread = []
  const onlyInPool = []
  const changed = []
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort()
  for (const path of paths) {
    const x = a.get(path)
    const y = b.get(path)
    if (!y) onlyInMainThread.push(path)
    else if (!x) onlyInPool.push(path)
    else if (x.sig !== y.sig) changed.push(path)
    else if (x.agg !== y.agg || x.resume !== y.resume) disagreeing.push(path)
  }
  return {
    entries: paths.length,
    disagreeing,
    onlyInMainThread,
    onlyInPool,
    changed,
    fails: disagreeing.length > 0 || onlyInMainThread.length > 0 || onlyInPool.length > 0
  }
}
