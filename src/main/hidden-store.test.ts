// Ticket 02 slice (c): manual hiding — stored in the app's own storage (never the agent configuration),
// written atomically, with scan applying the hidden flag.
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { HiddenStore } from './hidden-store'
import { scan } from './providers/scan'
import type { ScanRoots } from './providers/types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-hid-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('HiddenStore', () => {
  it('starting from an empty directory → nothing hidden; after set it persists and a new instance sees it', () => {
    const s1 = new HiddenStore(join(dir, 'store'))
    expect(s1.isHidden('/p/a')).toBe(false)
    s1.setHidden('/p/a', true)
    expect(s1.isHidden('/p/a')).toBe(true)
    const s2 = new HiddenStore(join(dir, 'store'))
    expect(s2.isHidden('/p/a')).toBe(true)
  })

  it('unhiding removes it from the persisted store', () => {
    const s = new HiddenStore(join(dir, 'store'))
    s.setHidden('/p/a', true)
    s.setHidden('/p/a', false)
    const s2 = new HiddenStore(join(dir, 'store'))
    expect(s2.isHidden('/p/a')).toBe(false)
  })

  it('a corrupt storage file → degrades to an empty set without throwing', () => {
    mkdirSync(join(dir, 'store'), { recursive: true })
    writeFileSync(join(dir, 'store', 'hidden.json'), '{broken')
    const s = new HiddenStore(join(dir, 'store'))
    expect(s.isHidden('/p/a')).toBe(false)
  })

  it('writes are atomic: no temporary file is left in the directory', () => {
    const s = new HiddenStore(join(dir, 'store'))
    s.setHidden('/p/a', true)
    const files = readdirSync(join(dir, 'store'))
    expect(files).toEqual(['hidden.json'])
  })
})

describe('scan applies hidden', () => {
  it('a project in the hidden set gets hidden=true (paths match by merge key, insensitive to a trailing slash)', async () => {
    const proj = join(dir, 'work', 'p1')
    mkdirSync(proj, { recursive: true })
    writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects: { [proj]: {} } }))
    const roots: ScanRoots = {
      claudeHome: join(dir, '.claude'),
      claudeConfigFile: join(dir, '.claude.json'),
      codexHome: join(dir, '.codex'),
      agentsSkillsDir: join(dir, '.agents', 'skills')
    }
    const store = new HiddenStore(join(dir, 'store'))
    store.setHidden(`${proj}/`, true)
    const snap = await scan(roots, { now: () => 1, isHidden: (p) => store.isHidden(p) })
    expect(snap.projects[0].hidden).toBe(true)
  })
})
