// Ticket 05: scanning the eight-step artifacts — recognising the six types (specs added 2026-08-01),
// title extraction, reverse chronological order,
// excluding README and vendor, and the missing-directory empty state; the type order is itself a contract
// (spec project-detail B1).
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readArtifacts } from './artifacts'
import { ARTIFACT_ORDER } from '@shared/domain'

let dir: string
let proj: string

function w(rel: string, content: string, atSec: number): void {
  const f = join(proj, rel)
  mkdirSync(join(f, '..'), { recursive: true })
  writeFileSync(f, content)
  utimesSync(f, atSec, atSec)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-art-'))
  proj = join(dir, 'p1')
  mkdirSync(proj, { recursive: true })
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readArtifacts', () => {
  it('B1 the type order is a contract: the top-down derivation chain (terminology → decisions → requirements → UI → capabilities → lessons)', () => {
    expect(ARTIFACT_ORDER).toEqual(['context', 'adr', 'specs', 'prototypes', 'features', 'postmortems'])
  })

  it('B2 specs is recognised by the same rules as the other five (docs/specs/*.md, README excluded)', () => {
    w('docs/specs/memory-view.md', '# Memory view\n', 700)
    w('docs/specs/README.md', '# Spec index\n', 800)
    const items = readArtifacts(proj)
    expect(items.map((i) => `${i.type}:${i.title}`)).toEqual(['specs:Memory view'])
  })

  it('recognises all six types, takes the first # heading as the title, orders globally by time descending, and excludes README', () => {
    w('CONTEXT.md', '# Glossary\n', 100)
    w('docs/adr/0001-first.md', '# ADR-0001 settle the architecture\n', 500)
    w('docs/adr/README.md', '# Index\n', 900)
    w('docs/specs/shot.md', '# Screenshot (requirements)\n', 600)
    w('docs/features/shot.md', '# Screenshot\n', 300)
    w('docs/postmortems/perm.md', '# Permissions pitfall\n', 400)
    w('docs/prototypes/list/prototype-list.html', '<title>List</title>', 200)
    const items = readArtifacts(proj)
    expect(items.map((i) => i.type)).toEqual([
      'specs',
      'adr',
      'postmortems',
      'features',
      'prototypes',
      'context'
    ])
    expect(items[0].title).toBe('Screenshot (requirements)') // The newest mtime (600) comes first — the list is ordered by time descending, independent of the type order
    expect(items.find((i) => i.type === 'context')?.title).toBe('Glossary')
    expect(items.some((i) => i.title === 'Index')).toBe(false)
  })

  it('prototypes: collects .html recursively, excluding the root index.html and vendor; the title is the filename', () => {
    w('docs/prototypes/index.html', '<title>Gallery</title>', 100)
    w('docs/prototypes/vendor/mermaid.min.js', 'x', 100)
    w('docs/prototypes/agents/prototype-agents.html', '<title>Agents</title>', 200)
    w('docs/prototypes/list/visibility/index.html', '<title>Logic</title>', 300)
    const items = readArtifacts(proj)
    const names = items.map((i) => i.title).sort()
    expect(names).toEqual(['list/visibility', 'prototype-agents'])
  })

  it('no docs directory → an empty array (the empty state for a project not following the eight steps, not an error)', () => {
    expect(readArtifacts(proj)).toEqual([])
  })

  it('a markdown file with no heading falls back to its filename', () => {
    w('docs/features/plain.md', 'body with no heading\n', 100)
    expect(readArtifacts(proj)[0].title).toBe('plain')
  })
})
