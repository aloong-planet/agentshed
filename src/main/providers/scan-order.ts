// The order a scan takes session files in (token-stats, Implementation Decisions, Scan order). The combination's
// rules that keep the first of several files sharing a key — a Claude message's copies, a Codex fork's parent among
// the files of one session id, an Antigravity call held by two conversations — make the order part of the figures, so
// whatever takes the store's entries outside a scan (the restore, a fork's parent lookup) takes them in this order.
//
// One comparator decides it, in this file: every walk orders a directory's entries by it, and the store's entries are
// put in scan order by it. A scan visits the data roots in a fixed order and each root depth-first, a directory's
// children at the directory's own place among its siblings; so two files compare by the root each lies under, then
// by their paths below it, component by component, each name by its UTF-8 bytes. Not by whole paths: `a-b/x` would come
// before `a/y`, as `-` is below `/`, where the walk takes directory `a` first. Not by JavaScript's string order either:
// it compares UTF-16 code units, which put a character beyond U+FFFF before one in U+E000–U+FFFF.
import { join, sep } from 'node:path'
import type { ScanRoots } from './types'

/** Two names in byte order of their UTF-8 encoding: how every walk orders a directory's entries */
export function compareNames(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

/** A directory's entries by their names, in that order */
export function byName<T extends { name: string }>(a: T, b: T): number {
  return compareNames(a.name, b.name)
}

/**
 * The data roots a scan walks, in the order it walks them: Claude Code's projects, Codex's sessions and then its
 * archived sessions, Grok's sessions, Antigravity CLI's conversations
 */
export function scanRoots(roots: ScanRoots): string[] {
  return [
    join(roots.claudeHome, 'projects'),
    join(roots.codexHome, 'sessions'),
    join(roots.codexHome, 'archived_sessions'),
    join(roots.grokHome, 'sessions'),
    join(roots.antigravityHome, 'conversations')
  ]
}

/**
 * Session files compared in scan order: by the root each lies under, in walk order, then by its path below that root,
 * component by component. A file under none of the roots comes after every file that is under one, by its whole path's
 * components.
 */
export function compareScanOrder(roots: ScanRoots): (a: string, b: string) => number {
  const walked = scanRoots(roots).map((root) => root + sep)
  const place = (file: string): { root: number; parts: string[] } => {
    const root = walked.findIndex((prefix) => file.startsWith(prefix))
    return root === -1 ? { root: walked.length, parts: file.split(sep) } : { root, parts: file.slice(walked[root].length).split(sep) }
  }
  return (a, b) => {
    const x = place(a)
    const y = place(b)
    if (x.root !== y.root) return x.root - y.root
    for (let i = 0; i < Math.min(x.parts.length, y.parts.length); i++) {
      const c = compareNames(x.parts[i], y.parts[i])
      if (c !== 0) return c
    }
    return x.parts.length - y.parts.length
  }
}
