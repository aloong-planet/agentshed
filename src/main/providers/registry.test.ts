// Ticket 02 slice (a): both sides' registries → the project union (badges / staleness / path
// normalisation).
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { scan } from './scan'
import type { ScanRoots } from './types'

let dir: string
function roots(): ScanRoots {
  return {
    claudeHome: join(dir, '.claude'),
    claudeConfigFile: join(dir, '.claude.json'),
    codexHome: join(dir, '.codex'),
    grokHome: join(dir, '.grok'),
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
    expect(snap.sides.grok.error).toBeTruthy()
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
    expect(snap.sides.claude.error).toBeTruthy()
    expect(snap.projects).toHaveLength(1)
    expect(snap.projects[0].name).toBe('ok-side')
  })
})
