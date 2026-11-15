// Project path normalisation and the merge key, shared by scan and the token engine. The engine module makes an
// Antigravity conversation's key by the same rule (`merge_key` in engine/src/text/mod.rs): a change here is made there
// too.
// The merge key = trailing slash removed + lowercased (the macOS filesystem is case-insensitive);
// display keeps the original spelling.

export function normalizePath(p: string): string {
  const stripped = p.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
}

export function mergeKey(p: string): string {
  return normalizePath(p).toLowerCase()
}
