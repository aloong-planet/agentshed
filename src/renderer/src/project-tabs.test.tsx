// @vitest-environment jsdom
// Which tab and window a project's page shows as the user moves around (project-detail::REQ-004, token-stats G11),
// on the whole app below the e2e seam (the test-layers spec). A scan is a snapshot emitted through the fake, the
// renderer's real input; the thin e2e case keeps real changes on disk. The fixtures' shapes are copied from
// payloads the real app returned.
import { afterEach, describe, expect, it } from 'vitest'
import { emptyTokenStats, type ProjectDetail, type ProjectEntry, type SessionPage, type Snapshot } from '@shared/domain'
import { all, cleanup, click, installFakeApi, mountApp, one, soon, text, withText } from './testing/fake-app'

const SIDE = { detected: true }
const path = (name: string): string => `/home/u/${name}`
const FILE = '/home/u/.claude/projects/-home-u-alpha/a.jsonl'
const AT = Date.now() - 86_400_000

const entry = (name: string, stale = false): ProjectEntry => ({
  path: path(name), name, sides: ['claude'], stale, lastSessionAt: name === 'alpha' ? AT : null, sessionCount: name === 'alpha' ? 1 : 0
})
const snapshot = (...projects: ProjectEntry[]): Snapshot => ({
  scannedAt: Date.now(),
  sides: { claude: SIDE, codex: { detected: false }, grok: { detected: false }, antigravity: { detected: false } },
  projects,
  global: { skills: [], subagents: [], memory: [], codexMemoriesEnabled: false, plugins: [], codexPlugins: [], antigravityPlugins: [], mcp: [], claudeMd: null, agentsMd: [] },
  tokens: emptyTokenStats(),
  archivedDays: []
})
const detail = (name: string): ProjectDetail => ({
  path: path(name), skills: [], subagents: [], memory: { main: null, mainFile: null, topics: [] }, plugins: [], mcp: [],
  configs: { claudeMd: null, agentsMd: null },
  stats: name === 'alpha'
    ? { tokens: emptyTokenStats(), sessions: [{ side: 'claude', title: 'Sample question', at: AT, tokens: 15, file: FILE, questionCount: 1, forkState: 'none' }] }
    : null,
  artifacts: []
})
const session: SessionPage = {
  revision: 'r', file: FILE, side: 'claude', title: 'Sample question', at: AT, tokens: 15, bytes: 400,
  forkState: 'none', forkPoints: 0, forkParentTitle: null, forkParentFile: null, sessionId: 'a',
  questions: [{ revision: 'q1', i: 1, text: 'Sample question', at: AT, tools: 0, subagents: 0 }]
}
const [alpha, beta, ghost, phantom] = [entry('alpha'), entry('beta'), entry('ghost', true), entry('phantom', true)]

let fake: ReturnType<typeof installFakeApi>
function start(...projects: ProjectEntry[]): void {
  fake = installFakeApi({
    snapshot: snapshot(...(projects.length ? projects : [alpha, beta, ghost, phantom])),
    details: [detail('alpha'), detail('beta'), detail('ghost')],
    pages: [session]
  })
  mountApp()
}
const toProjects = (): void => click(all('.rail .ri')[1])
const row = (name: string): HTMLElement => withText('.side .row', name)
async function pageIs(project: string, tab?: string): Promise<void> {
  await soon(() => {
    expect(text('.det-title h1')).toBe(project)
    if (tab) expect(text('.pane-head .tabs .tab.on')).toBe(tab)
  })
}
const windowIs = (label: string): Promise<void> => soon(() => expect(text('.tot-c.on .k')).toBe(label))
async function select(tab: string): Promise<void> {
  await soon(() => click(withText('.pane-head .tabs .tab', tab)))
  await soon(() => expect(text('.pane-head .tabs .tab.on')).toBe(tab))
}
async function chooseWindow(label: string): Promise<void> {
  await soon(() => click(withText('.tot-c', label)))
  await windowIs(label)
}
async function byTheRail(): Promise<void> {
  click(all('.rail .ri')[0])
  await soon(() => expect(text('.pane-head h1')).toBe('Agents'))
  toProjects()
}
async function bySideCard(): Promise<void> {
  click(all('.rail .ri')[0])
  await soon(() => click(one('.s .stat-link', all('.pane-head .stats .stat').find((c) => c.querySelector('.badge.cl')))))
}
const showStale = (): Promise<void> => soon(() => click(one('.side input[type="checkbox"]')))
async function toNote(project: string): Promise<void> {
  click(row(project))
  await soon(() => {
    expect(text('.det-title h1')).toBe(project)
    one('.stale-note')
  })
}
async function openSession(): Promise<void> {
  await select('Sessions')
  await soon(() => click(withText('.pane-body .se', 'Sample question')))
  await soon(() => expect(text('.pane-head .stitle')).toBe('Sample question'))
}
async function backFromSession(): Promise<void> {
  await openSession()
  click(one('.sback'))
  await pageIs('alpha', 'Sessions')
}
async function openProject(name: string, ...projects: ProjectEntry[]): Promise<void> {
  start(...projects)
  toProjects()
  await soon(() => click(row(name)))
  await pageIs(name)
}
const OUT_OF_SNAPSHOT = 'not in the snapshot'
const DEFAULT_WINDOW = 'Total · all history'

afterEach(cleanup)

describe('the tab and window a project opens on', () => {
  it('another project keeps them, and a click on the project\'s own row changes nothing', async () => {
    await openProject('alpha')
    await chooseWindow('Today')
    await select('Skills')
    click(row('alpha'))
    await pageIs('alpha', 'Skills')
    click(row('beta'))
    await pageIs('beta', 'Skills')
    await select('Overview')
    await windowIs('Today')
  })

  for (const [how, comeBack] of [['the rail', byTheRail], ['a side card', bySideCard]] as const) {
    it(`leaving by ${how} starts on Overview and the default window`, async () => {
      await openProject('beta')
      await chooseWindow('Today')
      await select('Skills')
      await comeBack()
      await pageIs('beta', 'Overview')
      await windowIs(DEFAULT_WINDOW)
    })

    it(`leaving by ${how} from a note page: the next project starts on Overview and the default window`, async () => {
      await openProject('beta')
      await chooseWindow('Today')
      await select('Skills')
      await showStale()
      await toNote('ghost')
      await comeBack()
      await soon(() => one('.stale-note'))
      await soon(() => click(row('beta')))
      await pageIs('beta', 'Overview')
      await windowIs(DEFAULT_WINDOW)
    })

    it(`coming back from a session lands on Sessions once: leaving by ${how} starts on Overview`, async () => {
      await openProject('alpha')
      await backFromSession()
      await comeBack()
      await pageIs('alpha', 'Overview')
      await backFromSession()
      await select('Skills')
      await comeBack()
      await pageIs('alpha', 'Overview')
    })
  }

  it('a note page has no tabs: the next project opens on the tab and window from before it, through two in a row', async () => {
    await openProject('alpha')
    await chooseWindow('Today')
    await select('Skills')
    await showStale()
    await toNote('ghost')
    click(row('alpha'))
    await pageIs('alpha', 'Skills')
    await select('Memory')
    await toNote('ghost')
    await toNote('phantom')
    click(row('beta'))
    await pageIs('beta', 'Memory')
    await select('Overview')
    await windowIs('Today')
  })

  it('a scan turning the page into a note or out of the snapshot and back draws the remembered tab and window', async () => {
    await openProject('alpha')
    await chooseWindow('Today')
    await select('Skills')
    fake.emitSnapshot(snapshot(entry('alpha', true), beta, ghost, phantom))
    await soon(() => one('.stale-note'))
    fake.emitSnapshot(snapshot(alpha, beta, ghost, phantom))
    await pageIs('alpha', 'Skills')
    await select('Overview')
    await windowIs('Today')
    await select('Memory')
    fake.emitSnapshot(snapshot(beta, ghost, phantom))
    await soon(() => expect(text('.detail .empty')).toContain(OUT_OF_SNAPSHOT))
    fake.emitSnapshot(snapshot(alpha, beta, ghost, phantom))
    await pageIs('alpha', 'Memory')
  })

  it('a session page takes the pane off the stage, and the window with it', async () => {
    await openProject('alpha')
    await chooseWindow('Today')
    await backFromSession()
    await select('Overview')
    await windowIs(DEFAULT_WINDOW)
  })

  it('with the landed page on screen another project takes it over, and leaving by the rail starts on Overview', async () => {
    await openProject('alpha')
    await backFromSession()
    click(row('beta'))
    await pageIs('beta', 'Sessions')
    await byTheRail()
    await pageIs('beta', 'Overview')
  })

  it('a project selected in the list from a session page lands on Sessions once, saying when it has none', async () => {
    await openProject('alpha')
    await openSession()
    click(row('beta'))
    await pageIs('beta', 'Sessions')
    await soon(() => expect(text('.pane-body .none')).toBe('No sessions in this project yet. They appear automatically once any agent side has a conversation in this directory.'))
    click(row('alpha'))
    await pageIs('alpha', 'Sessions')
    await byTheRail()
    await pageIs('alpha', 'Overview')
  })

  it('so does the session\'s own project, its row clicked with the session on screen', async () => {
    await openProject('alpha')
    await openSession()
    click(row('alpha'))
    await pageIs('alpha', 'Sessions')
    expect(all('.pane-head .stitle')).toHaveLength(0)
    await bySideCard()
    await pageIs('alpha', 'Overview')
  })

  it('whichever way the session was entered: from Overview\'s session card, then another project or the back control', async () => {
    await openProject('alpha')
    const fromTheCard = async (): Promise<void> => {
      await soon(() => click(withText('.pane-body .se', 'Sample question')))
      await soon(() => expect(text('.pane-head .stitle')).toBe('Sample question'))
    }
    await fromTheCard()
    click(row('beta'))
    await pageIs('beta', 'Sessions')
    click(row('alpha'))
    await pageIs('alpha', 'Sessions')
    await select('Overview')
    await fromTheCard()
    click(one('.sback'))
    await pageIs('alpha', 'Sessions')
  })

  it('a session left onto a note keeps the landing: the project a scan brings back opens on Sessions', async () => {
    await openProject('alpha')
    await openSession()
    await showStale()
    await toNote('ghost')
    fake.emitSnapshot(snapshot(alpha, beta, entry('ghost'), phantom))
    await pageIs('ghost', 'Sessions')
  })

  it('the project on screen leaves the snapshot: the next project clears the message and opens on the tab and window from before', async () => {
    await openProject('beta')
    await chooseWindow('Today')
    await select('Skills')
    fake.emitSnapshot(snapshot(alpha, ghost, phantom))
    await soon(() => expect(text('.detail .empty')).toContain(OUT_OF_SNAPSHOT))
    click(row('alpha'))
    await pageIs('alpha', 'Skills')
    expect(all('.detail .empty')).toHaveLength(0)
    await select('Overview')
    await windowIs('Today')
  })

  it('a note page whose project then leaves the snapshot is two such pages in a row', async () => {
    await openProject('alpha')
    await select('Instructions')
    await showStale()
    await toNote('phantom')
    fake.emitSnapshot(snapshot(alpha, ghost))
    await soon(() => expect(text('.detail .empty')).toContain(OUT_OF_SNAPSHOT))
    click(row('alpha'))
    await pageIs('alpha', 'Instructions')
  })

  it('a session left onto the not-in-snapshot state keeps the landing, while the main process refuses its reads', async () => {
    await openProject('alpha')
    await openSession()
    fake.refuseSessions()
    fake.emitSnapshot(snapshot(ghost))
    await soon(() => click(one('.sback')))
    await soon(() => expect(text('.detail .empty')).toContain(OUT_OF_SNAPSHOT))
    fake.emitSnapshot(snapshot(alpha, ghost))
    await pageIs('alpha', 'Sessions')
  })

  it('a first selection that goes through a note page has no earlier tab: the next project opens on Overview', async () => {
    start(alpha, ghost)
    toProjects()
    await soon(() => row('alpha'))
    await showStale()
    await toNote('ghost')
    click(row('alpha'))
    await pageIs('alpha', 'Overview')
  })
})
