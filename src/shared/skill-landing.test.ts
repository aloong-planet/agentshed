// The project skills directories as landings: one per directory, the shared one naming every side that loads it
// (skill-install::REQ-001/AC-01, A9). Expected values are written out from the spec, not derived from PROJECT_SKILLS_DIR.
import { describe, it, expect } from 'vitest'
import { skillLandings, skillsDirLoaders } from './skill-landing'

describe('skillLandings', () => {
  it('an Antigravity-only install lands in the shared directory, which still names both of its loaders', () => {
    expect(skillLandings(['antigravity'])).toEqual([
      { dir: '.agents/skills', sides: ['antigravity'], loaders: ['codex', 'antigravity'] }
    ])
  })

  it('a Codex-only install is the same one landing', () => {
    expect(skillLandings(['codex'])).toEqual([{ dir: '.agents/skills', sides: ['codex'], loaders: ['codex', 'antigravity'] }])
  })

  it('every side: Claude\'s directory, the shared one once with Codex first, then Grok\'s — whatever order they are given in', () => {
    expect(skillLandings(['grok', 'antigravity', 'claude', 'codex'])).toEqual([
      { dir: '.claude/skills', sides: ['claude'], loaders: ['claude'] },
      { dir: '.agents/skills', sides: ['codex', 'antigravity'], loaders: ['codex', 'antigravity'] },
      { dir: '.grok/skills', sides: ['grok'], loaders: ['grok'] }
    ])
  })

  it('no sides, no landing', () => {
    expect(skillLandings([])).toEqual([])
  })
})

describe('skillsDirLoaders', () => {
  it('names the sides loading a directory, and none for one no side loads', () => {
    expect(skillsDirLoaders('.agents/skills')).toEqual(['codex', 'antigravity'])
    expect(skillsDirLoaders('.claude/skills')).toEqual(['claude'])
    expect(skillsDirLoaders('.agents/agents')).toEqual([])
  })
})
