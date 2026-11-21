// The skill package root decision (docs/ops/electron-security.md item 26), judged through injected probes: a fake
// disk below answers them, so each refusal is shown to be the decision's own and not the disk's. The real probes are
// wired in providers/skill-package.ts, whose real-directory cases (there and in antigravity-components.test.ts) are the
// wiring check.
//
// An entry that is a link at one probe and not at the next is the entry seen as itself (a link) and followed (where it
// leads): the case below gives an entry outside every skills directory that leads into one. A link swapped between two
// probes of one path has no case of its own. The container check asks where the entry's directory really leads, and
// for an entry the decision picks, that directory is spelled as the library it is compared with, so a swap there only
// changes where both lead, and a link the entry itself becomes is followed wherever it leads (A6). A case could only
// pin whether the decision remembers a probe's first answer, which is not a rule of the boundary.
import { basename, dirname, join, normalize } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  inKnownSkillsDir,
  pluginSkillPackageRoot,
  skillPackageRoot,
  type SkillRootProbes
} from './skill-package-root'
import type { ScanRoots } from './providers/types'

const roots: ScanRoots = {
  claudeHome: '/h/.claude',
  claudeConfigFile: '/h/.claude.json',
  codexHome: '/h/.codex',
  geminiHome: '/h/.gemini',
  grokHome: '/h/.grok',
  antigravityHome: '/h/.gemini/antigravity-cli',
  agentsSkillsDir: '/h/.agents/skills'
}

/** Every global library a side loads, as the fake disk holds them */
const libraries = [
  '/h/.claude/skills',
  '/h/.agents/skills',
  '/h/.grok/skills',
  '/h/.gemini/antigravity-cli/skills',
  '/h/.gemini/config/skills',
  '/h/.gemini/skills'
]

/** A fake disk: the paths that are there, every directory holding them included, and the links among them (from ->
 * to; a link met inside a path is followed too) */
function disk(paths: string[], links: Record<string, string> = {}): SkillRootProbes {
  const there = new Set<string>()
  for (const p of [...paths, ...Object.keys(links)])
    for (let d = dirname(p); ; d = dirname(d)) {
      there.add(d)
      if (dirname(d) === d) break
    }
  for (const p of paths) there.add(p)
  const resolve = (p: string): string => {
    let n = normalize(p)
    for (const [from, to] of Object.entries(links)) if (n === from || n.startsWith(`${from}/`)) n = to + n.slice(from.length)
    return n
  }
  const leads = (p: string): string | null => {
    const to = resolve(p)
    return there.has(to) ? to : null
  }
  return {
    exists: (p) => leads(p) !== null,
    entryThere: (p) => {
      const self = join(resolve(dirname(p)), basename(normalize(p)))
      return there.has(self) || Object.hasOwn(links, self)
    },
    realPath: leads
  }
}

/** The same probes, recording every path they are asked about */
function recorded(probes: SkillRootProbes): { probes: SkillRootProbes; asked: string[] } {
  const asked: string[] = []
  const ask =
    <T,>(probe: (p: string) => T) =>
    (p: string): T => {
      asked.push(p)
      return probe(p)
    }
  return { probes: { exists: ask(probes.exists), entryThere: ask(probes.entryThere), realPath: ask(probes.realPath) }, asked }
}

const home = disk([...libraries, '/h/.claude/skills/tdd', '/h/.claude/skills/tdd/SKILL.md', '/h/.claude/skills/tdd/references'])
const withProject = disk([
  ...libraries,
  '/p/.claude/skills',
  '/p/.agents/skills',
  '/p/.grok/skills',
  '/p/.claude/skills/tdd',
  '/p/.claude/skills/tdd/SKILL.md'
])
const plugin = disk(['/r/skills', '/r/skills/tdd', '/r/skills/tdd/SKILL.md'])

const global = (name: string, probes: SkillRootProbes): string | null =>
  skillPackageRoot({ side: 'claude', name, scope: 'global', roots }, probes)
const inProject = (name: string, probes: SkillRootProbes): string | null =>
  skillPackageRoot({ side: 'claude', name, scope: 'project', projectPath: '/p', roots }, probes)
const fromPlugin = (name: string, probes: SkillRootProbes): string | null => pluginSkillPackageRoot('/r', name, probes)

/** The three places a skill package is named in, each with a disk holding its skill `tdd` */
const scopes = [
  ['global', global, home],
  ['project', inProject, withProject],
  ['plugin', fromPlugin, plugin]
] as const

/** A probe answering null for one path and as the disk does for every other */
const unresolvable = (probes: SkillRootProbes, path: string): SkillRootProbes => ({
  ...probes,
  realPath: (p) => (p === path ? null : probes.realPath(p))
})

describe('skillPackageRoot and pluginSkillPackageRoot (where a skill package may be listed from)', () => {
  it('admits a skill in a global library and returns where its entry really leads (C9, A6)', () => {
    const probes = disk([...libraries, '/repo/tdd', '/repo/tdd/SKILL.md'], { '/h/.claude/skills/tdd': '/repo/tdd' })
    expect(global('tdd', probes)).toBe('/repo/tdd')
  })

  it('admits a skill in a skills directory of the project it is listed for', () => {
    expect(inProject('tdd', withProject)).toBe('/p/.claude/skills/tdd')
  })

  it('admits a skill in skills/ of a plugin root and returns where its entry really leads (plugins-view H8)', () => {
    const probes = disk(['/r/skills', '/store/tdd', '/store/tdd/SKILL.md'], { '/r/skills/tdd': '/store/tdd' })
    expect(fromPlugin('tdd', probes)).toBe('/store/tdd')
  })

  it('opens a global skill no library holds with a SKILL.md from the first library holding its entry at all (C5)', () => {
    const probes = disk([...libraries, '/h/.gemini/config/skills/broken', '/h/.gemini/skills/broken'])
    expect(skillPackageRoot({ side: 'antigravity', name: 'broken', scope: 'global', roots }, probes)).toBe(
      '/h/.gemini/config/skills/broken'
    )
  })

  it.each([
    ['the entry itself cannot be looked at', () => global('tdd', { ...home, entryThere: () => false })],
    ['the real path of its directory cannot be told', () => global('tdd', unresolvable(home, '/h/.claude/skills'))],
    ['where the entry leads cannot be told', () => global('tdd', unresolvable(home, '/h/.claude/skills/tdd'))],
    ['where a plugin skill leads cannot be told', () => fromPlugin('tdd', unresolvable(plugin, '/r/skills/tdd'))]
  ])('refuses an entry it cannot look at (C9 fail-closed): %s', (_what, judge) => {
    expect(judge()).toBeNull()
  })

  it.each(
    scopes.flatMap(([scope, judge, probes]) =>
      ['', '..', 'a/b', 'a\\b'].map((name) => [scope, JSON.stringify(name), judge, probes, name] as const)
    )
  )('refuses a %s skill named %s (with `..`, `/` or `\\`, or no name) before the disk is asked', (_scope, _shown, judge, probes, name) => {
    const { probes: asking, asked } = recorded(probes)
    expect(judge(name, asking)).toBeNull()
    expect(asked).toEqual([])
  })

  it('refuses a plugin skill named `.`, which names the whole skills directory, before the disk is asked', () => {
    const { probes, asked } = recorded(plugin)
    expect(fromPlugin('.', probes)).toBeNull()
    expect(asked).toEqual([])
  })

  it.each(scopes)('refuses a %s skill named by a plugin namespace before the disk is asked', (_scope, judge, probes) => {
    const { probes: asking, asked } = recorded(probes)
    expect(judge('plug:tdd', asking)).toBeNull()
    expect(asked).toEqual([])
  })

  it.each([undefined, ''])('refuses a project skill when no project is named (%j), before the disk is asked', (projectPath) => {
    const { probes, asked } = recorded(withProject)
    expect(skillPackageRoot({ side: 'claude', name: 'tdd', scope: 'project', projectPath, roots }, probes)).toBeNull()
    expect(asked).toEqual([])
  })

  it('refuses a skills directory itself, which the name `.` reaches', () => {
    expect(global('.', home)).toBeNull()
  })
})

describe('inKnownSkillsDir (the container check, judged where the entry is)', () => {
  it.each([
    ['a lookalike beside a library', '/h/.claude/skills-old/x', disk([...libraries, '/h/.claude/skills-old/x'])],
    [
      'a spelling that climbs out of a library',
      '/h/.claude/skills/../elsewhere/x',
      disk([...libraries, '/h/.claude/elsewhere/x'])
    ]
  ])('refuses an entry whose directory resolves outside every skills directory: %s', (_what, entry, probes) => {
    expect(inKnownSkillsDir(entry, roots, undefined, probes)).toBe(false)
  })

  it('refuses an entry outside every skills directory that is a link into one', () => {
    const probes = disk([...libraries, '/h/.claude/skills/tdd'], { '/e/tdd': '/h/.claude/skills/tdd' })
    expect(inKnownSkillsDir('/e/tdd', roots, undefined, probes)).toBe(false)
  })

  it('refuses a directory below a package', () => {
    expect(inKnownSkillsDir('/h/.claude/skills/tdd/references', roots, undefined, home)).toBe(false)
  })
})
