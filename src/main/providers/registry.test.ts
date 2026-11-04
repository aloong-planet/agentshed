// Ticket 02 slice (a): both sides' registries → the project union (badges / staleness / path
// normalisation).
import { chmodSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import type { ScanRoots } from './types'
import { ERR } from '@shared/errors'
import { settingsJson } from '../testing/agy-fixture'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    geminiHome: join(dir, '.gemini'),
    grokHome: join(dir, '.grok'),
    antigravityHome: join(dir, '.gemini', 'antigravity-cli'),
    agentsSkillsDir: join(dir, '.agents', 'skills')
  }
}
/** Create a genuinely existing "project directory" and return its path */
function mkProject(name: string): string {
  const p = join(dir, 'work', name)
  mkdirSync(p, { recursive: true })
  return p
}
function writeClaudeRegistry(paths: string[]): void {
  const projects: Record<string, object> = {}
  for (const p of paths) projects[p] = {}
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ projects }))
}
function writeCodexRegistry(paths: string[]): void {
  mkdirSync(join(dir, '.codex'), { recursive: true })
  const lines = paths.map((p) => `[projects."${p}"]\ntrust_level = "trusted"\n`).join('\n')
  writeFileSync(join(dir, '.codex', 'config.toml'), `model = "gpt-5.5-codex"\n\n${lines}`)
}
/** The real shape measured 2026-08-16: [folders."<abs path>"] sections with trusted/decided_at keys */
function writeGrokRegistry(paths: string[]): void {
  mkdirSync(join(dir, '.grok'), { recursive: true })
  const lines = paths.map((p) => `[folders."${p}"]\ntrusted = true\ndecided_at = 1786088401\n`).join('\n')
  writeFileSync(join(dir, '.grok', 'trusted_folders.toml'), lines)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentshed-reg-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the registry union', () => {
  it('the Claude registry → project entries; an existing directory is normal and a missing one is stale', async () => {
    const alive = mkProject('alive')
    writeClaudeRegistry([alive, join(dir, 'work', 'ghost')])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(2)
    const byName = Object.fromEntries(snap.projects.map((p) => [p.name, p]))
    expect(byName['alive']).toMatchObject({ sides: ['claude'], stale: false })
    expect(byName['ghost']).toMatchObject({ sides: ['claude'], stale: true })
  })

  it.skipIf(process.getuid?.() === 0)('a directory that cannot be reached is not stale, and one that is really not there still is (projects-list A6)', async () => {
    const locked = join(dir, 'work', 'locked')
    const blocked = join(locked, 'blocked')
    mkdirSync(blocked, { recursive: true })
    const file = join(dir, 'work', 'a-file')
    writeFileSync(file, '')
    writeClaudeRegistry([blocked, join(dir, 'work', 'ghost'), join(file, 'under-a-file')])
    chmodSync(locked, 0o000)
    try {
      const snap = await scan(roots(), { now: () => 1 })
      const staleByName = Object.fromEntries(snap.projects.map((p) => [p.name, p.stale]))
      expect(staleByName).toEqual({ blocked: false, ghost: true, 'under-a-file': true })
    } finally {
      chmodSync(locked, 0o755)
    }
  })

  it('the Codex config.toml registry → project entries', async () => {
    const p = mkProject('codex-only')
    writeCodexRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0]).toMatchObject({ name: 'codex-only', sides: ['codex'], stale: false })
  })

  it('the same directory registered on both sides → merged into one entry with both badges', async () => {
    const p = mkProject('both')
    writeClaudeRegistry([p])
    writeCodexRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].sides).toEqual(['claude', 'codex'])
  })

  it('the Grok trusted-folder ledger → project entries; a missing directory is stale', async () => {
    const alive = mkProject('grok-alive')
    writeGrokRegistry([alive, join(dir, 'work', 'grok-ghost')])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.grok.detected).toBe(true)
    expect(snap.projects).toHaveLength(2)
    const byName = Object.fromEntries(snap.projects.map((p) => [p.name, p]))
    expect(byName['grok-alive']).toMatchObject({ sides: ['grok'], stale: false })
    expect(byName['grok-ghost']).toMatchObject({ sides: ['grok'], stale: true })
  })

  it('the same directory registered on all three sides → one entry with a side count of 3 (A4)', async () => {
    const p = mkProject('tri')
    writeClaudeRegistry([p])
    writeCodexRegistry([p])
    writeGrokRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].sides).toEqual(['claude', 'codex', 'grok'])
    expect(snap.projects[0].sides).toHaveLength(3)
  })

  it('A9: an installed side that has registered nothing → detected with no projects, and no error', async () => {
    mkdirSync(join(dir, '.grok'), { recursive: true }) // The data root exists, the ledger does not
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.grok.detected).toBe(true)
    expect(snap.sides.grok.error).toBeUndefined()
    expect(snap.projects).toEqual([])
  })

  it('a folders key that is not a table → the Grok side degrades to empty WITH an error (A3), unlike the absent-ledger A9 case', async () => {
    mkdirSync(join(dir, '.grok'), { recursive: true })
    // Parses fine, but the folders key is not the table the ledger's shape promises — corrupt, not
    // empty, and degrading without an explanation would leave the user with no projects and no clue
    writeFileSync(join(dir, '.grok', 'trusted_folders.toml'), 'folders = 3\n')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.grok.detected).toBe(true)
    expect(snap.sides.grok.error).toBeTruthy()
    expect(snap.projects).toEqual([])
  })

  it('a corrupt trusted_folders.toml → the Grok side degrades to empty with an error while the others behave normally', async () => {
    mkdirSync(join(dir, '.grok'), { recursive: true })
    writeFileSync(join(dir, '.grok', 'trusted_folders.toml'), '[folders."/x"\nbroken toml')
    const p = mkProject('ok-side')
    writeClaudeRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.grok.detected).toBe(true)
    expect(snap.sides.grok.error).toEqual({ code: ERR.registryParseFailed, params: { path: join(dir, '.grok', 'trusted_folders.toml') } })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].name).toBe('ok-side')
  })

  it('a trailing-slash difference produces no duplicate', async () => {
    const p = mkProject('slashy')
    writeClaudeRegistry([p])
    writeCodexRegistry([`${p}/`])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].sides).toEqual(['claude', 'codex'])
  })

  it('a corrupt registry JSON → that side degrades to empty with an error while the other behaves normally', async () => {
    writeFileSync(join(dir, '.claude.json'), '{broken json')
    const p = mkProject('ok-side')
    writeCodexRegistry([p])
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.claude.detected).toBe(true)
    expect(snap.sides.claude.error).toEqual({ code: ERR.registryParseFailed, params: { path: join(dir, '.claude.json') } })
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].name).toBe('ok-side')
  })

  // The Codex reader looks for section headers line by line and parses nothing, so its one failure is a read
  it('a config.toml that is not valid TOML is no error on the Codex side: its reader only reads the file', async () => {
    mkdirSync(join(dir, '.codex'), { recursive: true })
    writeFileSync(join(dir, '.codex', 'config.toml'), '[projects."unterminated')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.codex.detected).toBe(true)
    expect(snap.sides.codex.error).toBeUndefined()
  })

  // agents-overview A3: a file that cannot be read is told apart from a corrupt one, and neither carries the system's text
  describe.skipIf(process.getuid?.() === 0)('a registry that exists and cannot be read', () => {
    const sides = [
      { side: 'claude', rel: ['.claude.json'], write: (p: string) => writeClaudeRegistry([p]) },
      { side: 'codex', rel: ['.codex', 'config.toml'], write: (p: string) => writeCodexRegistry([p]) },
      { side: 'grok', rel: ['.grok', 'trusted_folders.toml'], write: (p: string) => writeGrokRegistry([p]) },
      {
        side: 'antigravity',
        rel: ['.gemini', 'antigravity-cli', 'settings.json'],
        write: (p: string) => {
          mkdirSync(join(dir, '.gemini', 'antigravity-cli'), { recursive: true })
          writeFileSync(join(dir, '.gemini', 'antigravity-cli', 'settings.json'), settingsJson([p]))
        }
      }
    ] as const
    it.each(sides)('$side says so with the file, and the other side behaves normally', async ({ side, rel, write }) => {
      write(mkProject('locked-side'))
      const other = mkProject('other-side')
      if (side === 'claude') writeCodexRegistry([other])
      else writeClaudeRegistry([other])
      const file = join(dir, ...rel)
      chmodSync(file, 0o000)
      try {
        const snap = await scan(roots(), { now: () => 1 })
        expect(snap.sides[side].detected).toBe(true)
        expect(snap.sides[side].error).toEqual({ code: ERR.registryUnreadable, params: { path: file } })
        expect(snap.projects.map((e) => e.name)).toEqual(['other-side'])
      } finally {
        chmodSync(file, 0o644)
      }
    })

    // A file behind a directory that cannot be entered is unreadable too (a data root left owned by root by `sudo`, say):
    // that must not read as a side that has registered nothing (A9). Claude's file sits in the home directory itself
    it.each(sides.filter((s) => s.side !== 'claude'))('$side behind a data root that cannot be entered says so too', async ({ side, rel, write }) => {
      write(mkProject('locked-side'))
      writeClaudeRegistry([mkProject('other-side')])
      const file = join(dir, ...rel)
      const root = dirname(file)
      chmodSync(root, 0o000)
      try {
        const snap = await scan(roots(), { now: () => 1 })
        expect(snap.sides[side].detected).toBe(true)
        expect(snap.sides[side].error).toEqual({ code: ERR.registryUnreadable, params: { path: file } })
      } finally {
        chmodSync(root, 0o755)
      }
    })

    // agy's data root is the one with a parent of its own, so it alone can be hidden from the detection itself: it still
    // exists (agents-overview::REQ-003/AC-01), and its registry is what cannot be read
    it('antigravity behind a .gemini that cannot be entered is detected, and says its registry cannot be read', async () => {
      const root = join(dir, '.gemini', 'antigravity-cli')
      mkdirSync(root, { recursive: true })
      writeFileSync(join(root, 'settings.json'), settingsJson([]))
      chmodSync(join(dir, '.gemini'), 0o000)
      try {
        const snap = await scan(roots(), { now: () => 1 })
        expect(snap.sides.antigravity.detected).toBe(true)
        expect(snap.sides.antigravity.error).toEqual({ code: ERR.registryUnreadable, params: { path: join(root, 'settings.json') } })
      } finally {
        chmodSync(join(dir, '.gemini'), 0o755)
      }
    })
  })

  it('a data root that is a plain file holds no registry: detected with no projects and no error (A9)', async () => {
    writeFileSync(join(dir, '.grok'), '')
    const snap = await scan(roots(), { now: () => 1 })
    expect(snap.sides.grok.detected).toBe(true)
    expect(snap.sides.grok.error).toBeUndefined()
  })
})
