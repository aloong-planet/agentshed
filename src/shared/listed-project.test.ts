import { describe, it, expect } from 'vitest'
import { isListedProject } from './listed-project'

// project-detail::CON-001/AC-01: a row for each spelling of a listed project's directory a renderer could send, and one
// for a directory no project has.
describe('isListedProject (whether the snapshot lists a directory as a project)', () => {
  const nfc = '/Users/x/work/café'.normalize('NFC')
  const projects = [
    { path: '/Users/x/work/alpha' },
    { path: '/Users/x/work/beta' },
    { path: '/Users/x/work/beta/nested' },
    { path: nfc },
    { path: '/Users/x/work/gone', stale: true }
  ]

  it.each([
    ['admits a listed project by its exact path', projects, '/Users/x/work/beta', true],
    ['admits a listed project inside another listed project', projects, '/Users/x/work/beta/nested', true],
    ['admits a project the snapshot lists as stale', projects, '/Users/x/work/gone', true],
    ['refuses a directory no project has', projects, '/Users/x/work/gamma', false],
    ['refuses a listed project with a trailing separator', projects, '/Users/x/work/alpha/', false],
    ['refuses a listed project spelled with a . segment', projects, '/Users/x/work/./alpha', false],
    ['refuses a .. segment leading to a listed project', projects, '/Users/x/work/alpha/../beta', false],
    ['refuses a prefix lookalike of a listed project', projects, '/Users/x/work/alpha2', false],
    ['refuses a directory inside a listed project that is not itself listed', projects, '/Users/x/work/alpha/src', false],
    ['refuses a percent-encoded spelling of a listed project', projects, '/Users/x/work/%61lpha', false],
    ['refuses a listed project spelled in another Unicode normalisation', projects, nfc.normalize('NFD'), false],
    ['refuses a listed project in another letter case', projects, '/Users/x/work/ALPHA', false],
    ['refuses any directory when the snapshot lists no project', [], '/Users/x/work/alpha', false]
  ])('%s', (_what, listed, dir, expected) => {
    expect(isListedProject(listed, dir)).toBe(expected)
  })
})
