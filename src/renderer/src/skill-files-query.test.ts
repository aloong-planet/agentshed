// skill-files-query: the query-layer wrapper around listSkillFiles (ADR-0028), shared by
// SkillExpandBlock and PluginSkillList (two call sites, one shape). Unlike project-detail-query and
// session-page-query this is a non-suspense query: both call sites already have their own in-place
// loading/error UI (a table's own spinner, not a page-wide fallback), so useQuery is the right tool.
import { describe, it, expect } from 'vitest'
import type { ListSkillFilesArgs, ListSkillFilesResult } from '@shared/ipc'
import { fetchSkillFiles, skillFilesQueryKey } from './skill-files-query'

const args: ListSkillFilesArgs = { side: 'claude', name: 'tdd', scope: 'global' }
const fixture: ListSkillFilesResult = { files: [], deep: false, deepPaths: [] }

describe('fetchSkillFiles (resolves to a result value rather than throwing)', () => {
  it('wraps a successful list as an ok result', async () => {
    const r = await fetchSkillFiles(args, () => Promise.resolve(fixture))
    expect(r).toEqual({ ok: true, listing: fixture })
  })

  it('wraps a rejecting list as an error result rather than throwing', async () => {
    const boom = new Error('denied')
    const r = await fetchSkillFiles(args, () => Promise.reject(boom))
    expect(r).toEqual({ ok: false, error: boom })
  })
})

describe('skillFilesQueryKey (every field that distinguishes one package from another)', () => {
  it('composes a key carrying the full args object', () => {
    expect(skillFilesQueryKey(args)).toEqual(['skillFiles', args])
  })

  it('two different scopes for the same name produce different keys', () => {
    const project: ListSkillFilesArgs = { side: 'claude', name: 'tdd', scope: 'project', projectPath: '/p' }
    expect(skillFilesQueryKey(args)).not.toEqual(skillFilesQueryKey(project))
  })

  it('two different plugin roots for the same bare name produce different keys', () => {
    const a: ListSkillFilesArgs = { side: 'claude', name: 'x', scope: 'plugin', pluginRoot: '/a' }
    const b: ListSkillFilesArgs = { side: 'claude', name: 'x', scope: 'plugin', pluginRoot: '/b' }
    expect(skillFilesQueryKey(a)).not.toEqual(skillFilesQueryKey(b))
  })

  it('null (not expanded yet) is a key of its own, distinct from any real args', () => {
    expect(skillFilesQueryKey(null)).toEqual(['skillFiles', null])
    expect(skillFilesQueryKey(null)).not.toEqual(skillFilesQueryKey(args))
  })
})
