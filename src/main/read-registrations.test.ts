import { expect, it } from 'vitest'
import { ReadRegistry } from './read-registrations'

it('replaces one authoritative scope without removing another owner of the same path', () => {
  const registry = new ReadRegistry([{ owner: 'scan', memoryFiles: ['/shared', '/old'], skillFiles: [], projects: [], pluginRoots: [] },
    { owner: 'project:/p', memoryFiles: ['/shared', '/project'], skillFiles: [], projects: ['/p'], pluginRoots: [] }])
  expect(registry.admission('memoryFiles', '/old')).toBe('restored')
  registry.replace({ owner: 'scan', memoryFiles: ['/new'], skillFiles: [], projects: [], pluginRoots: [] })
  expect(registry.admission('memoryFiles', '/old')).toBeNull()
  expect(registry.admission('memoryFiles', '/shared')).toBe('restored')
  expect(registry.admission('memoryFiles', '/new')).toBe('live')
  expect(registry.admission('memoryFiles', '/arbitrary')).toBeNull()
})
