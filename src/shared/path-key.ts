// Project path normalisation and the merge key: the single source (shared by scan, hidden-store and the
// token engine).
// The merge key = trailing slash removed + lowercased (the macOS filesystem is case-insensitive);
// display keeps the original spelling.

export function normalizePath(p: string): string {
  const stripped = p.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

export function mergeKey(p: string): string {
  return normalizePath(p).toLowerCase()
}
