import { expect, it } from 'vitest'
import { ReadRegistry } from './read-registrations'

it('replaces one authoritative scope without removing another owner of the same path', () => {
  const registry = new ReadRegistry([{ owner: 'scan', artifacts: ['/shared', '/old'], skillFiles: [], projects: [], pluginRoots: [] },
    { owner: 'project:/p', artifacts: ['/shared', '/project'], skillFiles: [], projects: ['/p'], pluginRoots: [] }])
  expect(registry.admission('artifacts', '/old')).toBe('restored')
  registry.replace({ owner: 'scan', artifacts: ['/new'], skillFiles: [], projects: [], pluginRoots: [] })
  expect(registry.admission('artifacts', '/old')).toBeNull()
  expect(registry.admission('artifacts', '/shared')).toBe('restored')
  expect(registry.admission('artifacts', '/new')).toBe('live')
  expect(registry.admission('artifacts', '/arbitrary')).toBeNull()
})
