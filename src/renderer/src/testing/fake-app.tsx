// The component tests' harness (ADR-0038, the test-layers spec). A real component tree over a fake of the
// renderer's one boundary to the main process. Every payload passes the contract the preload applies, so a
// fixture cannot drift into a shape the app would refuse; a method a test did not expect to be called throws.
import { StrictMode, Suspense, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { emptyDisplayData } from '@shared/display-data'
import { type ProjectDetail, type SessionPage, type SessionTurn, type Snapshot } from '@shared/domain'
import { appError, ERR } from '@shared/errors'
import { DEFAULT_PREFS } from '@shared/prefs'
import { TREND_WINDOW_DAYS } from '@shared/trend'
import { IDLE_UPDATE } from '@shared/update'
import { contractError, validateProjectDetail, validateSessionPage, validateSessionTurn, validateSnapshot, type ValidateResult } from '@shared/validate'
import { App } from '../App'
import { DisplayClock } from '../DisplayClock'
import { LanguageProvider } from '../language'
import { createQueryClient } from '../query-client'
import { SessionPane } from '../SessionPane'
import { StartupContext } from '../StartupHint'

export interface FakeData {
  snapshot?: Snapshot
  details?: ProjectDetail[]
  pages?: SessionPage[]
  turns?: Record<string, SessionTurn[]>
}

function checked<T>(name: string, v: T, validate: (v: unknown) => ValidateResult): T {
  const r = validate(v)
  if (!r.ok) throw contractError(name, r.failure)
  return v
}

const noUnsubscribe = (): (() => void) => () => {}

export function installFakeApi(data: FakeData): { emitSnapshot: (s: Snapshot) => void; refuseSessions: () => void } {
  const details = new Map((data.details ?? []).map((d) => [d.path, checked('projectDetail', d, validateProjectDetail)]))
  const pages = new Map((data.pages ?? []).map((p) => [p.file, checked('sessionPage', p, validateSessionPage)]))
  for (const ts of Object.values(data.turns ?? {})) for (const t of ts) checked('sessionTurn', t, validateSessionTurn)
  let snapshot = data.snapshot && checked('snapshot', data.snapshot, validateSnapshot)
  let refusing = false
  const onSnapshot = new Set<(s: Snapshot) => void>()
  const impl: Record<string, unknown> = {
    initialLanguage: 'en',
    initialTrendSpan: TREND_WINDOW_DAYS,
    systemLanguages: ['en-US'],
    appVersion: '',
    updatesAvailable: false,
    getPrefs: () => Promise.resolve(DEFAULT_PREFS),
    getStartup: () => Promise.resolve({ display: emptyDisplayData(), status: 'ready' }),
    getUpdateState: () => Promise.resolve(IDLE_UPDATE),
    getSnapshot: () => Promise.resolve(snapshot),
    getProjectDetail: (path: string) => Promise.resolve(details.get(path)),
    getSessionPage: (file: string) => refusing ? Promise.reject(appError(ERR.sessionNotWhitelisted, { file })) : Promise.resolve(pages.get(file)),
    sessionFresh: () => Promise.resolve(true),
    getSessionTurn: ({ file, i }: { file: string; i: number }) => Promise.resolve(data.turns?.[file]?.[i]),
    onStartupStatus: noUnsubscribe,
    onMenuOpenSettings: noUnsubscribe,
    onMenuOpenSearch: noUnsubscribe,
    onUpdateState: noUnsubscribe,
    onUpdateNotice: noUnsubscribe,
    onSnapshot: (cb: (s: Snapshot) => void) => {
      onSnapshot.add(cb)
      return () => onSnapshot.delete(cb)
    }
  }
  window.agentshed = new Proxy(impl, {
    get: (target, key: string) => {
      if (key in target) return target[key]
      throw new Error(`the fake window.agentshed has no ${key}`)
    }
  }) as unknown as typeof window.agentshed
  // What jsdom lacks; nothing these tests assert depends on what they would compute
  window.ResizeObserver = class { observe(): void {} unobserve(): void {} disconnect(): void {} }
  return {
    emitSnapshot: (s) => {
      snapshot = checked('snapshot', s, validateSnapshot)
      act(() => onSnapshot.forEach((cb) => cb(s)))
    },
    refuseSessions: () => { refusing = true }
  }
}

function mount(children: ReactNode): void {
  render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <DisplayClock>{children}</DisplayClock>
      </QueryClientProvider>
    </StrictMode>
  )
}

/** The whole app, as its entry mounts it */
export const mountApp = (): void => mount(<App />)

export function mountSessionPage(file: string, onBack: () => void = () => {}, onOpenSession?: (file: string) => void): void {
  mount(
    <LanguageProvider lang="en">
      <StartupContext.Provider value="ready">
        <Suspense fallback={null}>
          <SessionPane file={file} projectName="demo-proj" projectDir="/home/u/demo-proj" stale={false} now={Date.now()} onBack={onBack} onOpenSession={onOpenSession} />
        </Suspense>
      </StartupContext.Provider>
    </LanguageProvider>
  )
}

export { cleanup, waitFor as soon }
export const all = (selector: string, root: ParentNode = document): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(selector)]
export function one(selector: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`nothing matches ${selector}`)
  return el
}
const normal = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim()
export const text = (selector: string, root: ParentNode = document): string => normal(one(selector, root).textContent)
export const texts = (selector: string, root: ParentNode = document): string[] => all(selector, root).map((e) => normal(e.textContent))
export function withText(selector: string, hasText: string): HTMLElement {
  const el = all(selector).find((e) => normal(e.textContent).includes(hasText))
  if (!el) throw new Error(`no ${selector} contains ${hasText}`)
  return el
}
export const click = (el: HTMLElement): void => { fireEvent.click(el) }
