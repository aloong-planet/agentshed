import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@shared/domain'
import type { Prefs } from '@shared/prefs'
import { backfillPrefs, type PrefKey } from './prefs-backfill'
import {
  DEFAULT_MODE,
  DEFAULT_SCHEME,
  type AppearanceMode,
  type AppearanceScheme
} from '@shared/appearance'
import { dictOf, effectiveLanguage, type Language, type LanguagePreference } from '@shared/i18n'
import { ProjectsPane } from './ProjectsPane'
import { AgentsPane } from './AgentsPane'
import { DetailPane } from './DetailPane'
import { SessionPane } from './SessionPane'
import { SettingsPane } from './SettingsPane'
import { Toasts, toast } from './Toast'

type Dim = 'agents' | 'projects' | 'settings'

function applyScheme(scheme: AppearanceScheme): void {
  document.documentElement.dataset.scheme = scheme
}

function applyLang(lang: Language): void {
  document.documentElement.lang = dictOf(lang).htmlLang
}

export function App(): JSX.Element {
  const [dim, setDim] = useState<Dim>('agents')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  // 会话页视图态(票 04):非空时项目详情区整块换成会话页;换项目即退出
  const [openSession, setOpenSession] = useState<string | null>(null)
  // 票 08:搜索命中直达——打开会话页时定位到第几条提问(1 起;null = 不定位)
  const [openFocusQ, setOpenFocusQ] = useState<number | null>(null)
  // 从会话页返回时回到「会话」分栏(原型:‹ 返回 <项目> · 会话),而非概览
  const [backToSessions, setBackToSessions] = useState(false)
  const [scheme, setScheme] = useState<AppearanceScheme>(DEFAULT_SCHEME)
  // 模式只用来渲染分段控件的选中态:生效明暗由主进程的 themeSource 决定,
  // 渲染层不据此写任何 DOM 属性(见 docs/specs/appearance.md 的实现决策)
  const [mode, setMode] = useState<AppearanceMode>(DEFAULT_MODE)
  // 生效语言由主进程在窗口创建时算好经启动参数带来,**首帧即正确**——
  // 若改成 mount 后异步取,首帧会是默认语言、随后整页文字跳变一次。
  const [lang, setLang] = useState<Language>(window.agentshed.initialLanguage)
  // 语言偏好(可为「跟随系统」)只有选择器要用,异步取即可,不影响首帧文字
  const [langPref, setLangPref] = useState<LanguagePreference>('system')
  const t = dictOf(lang)
  // 用户已亲手改过的偏好项:mount 时那次 getPrefs 的回声不得覆盖它们(#61)。
  // 逐项记而不是记一个总开关,理由见 backfillPrefs。
  const touchedPrefs = useRef<Set<PrefKey>>(new Set())
  // 三个偏好 state 的实时镜像:回填发生在 effect 的回调里,而该 effect 依赖为空、
  // 闭包捕获的是 mount 时的旧值。同 LanguageSelect 里 cursorRef 的用法。
  const prefsRef = useRef<Prefs>({ scheme, language: langPref, mode })
  prefsRef.current = { scheme, language: langPref, mode }
  const selectProject = (p: string | null): void => {
    setSelected(p)
    setOpenSession(null)
    setOpenFocusQ(null)
    setBackToSessions(false)
  }

  useEffect(() => {
    applyScheme(DEFAULT_SCHEME)
    applyLang(window.agentshed.initialLanguage)
    let alive = true
    void window.agentshed.getPrefs().then((p) => {
      if (!alive) return
      // 这份回声读的是**发出请求那一刻**的磁盘状态;用户若抢在它 resolve 之前改了
      // 某项,那一项以本地为准,其余仍采用回声(#61)
      const next = backfillPrefs(prefsRef.current, p, touchedPrefs.current)
      setScheme(next.scheme)
      applyScheme(next.scheme)
      setLangPref(next.language)
      setMode(next.mode)
    })
    void window.agentshed.getSnapshot().then((s) => {
      if (alive) setSnap(s)
    })
    const off = window.agentshed.onSnapshot((s) => setSnap(s))
    return () => {
      alive = false
      off()
    }
  }, [])

  async function refresh(): Promise<void> {
    if (refreshing) return
    setRefreshing(true)
    try {
      setSnap(await window.agentshed.refresh())
    } finally {
      setRefreshing(false)
    }
  }

  async function onScheme(s: AppearanceScheme): Promise<void> {
    // 先本地生效再落盘:无「仅设置页换肤」的中间态,失败则回读或 toast
    touchedPrefs.current.add('scheme')
    setScheme(s)
    applyScheme(s)
    try {
      const p = await window.agentshed.setScheme(s)
      setScheme(p.scheme)
      applyScheme(p.scheme)
    } catch (e) {
      toast('err', `保存外观失败:${String(e)}`)
    }
  }

  async function onMode(m: AppearanceMode): Promise<void> {
    // 与外观方案不同:明暗的生效由主进程设 themeSource 完成,渲染层无处可"先本地生效"。
    // 故先乐观更新选中态,落盘结果回来再以它为准
    touchedPrefs.current.add('mode')
    setMode(m)
    try {
      const p = await window.agentshed.setMode(m)
      setMode(p.mode)
    } catch (e) {
      toast('err', `保存外观模式失败:${String(e)}`)
    }
  }

  async function onLanguage(next: LanguagePreference): Promise<void> {
    // 生效语言在本地算得出(系统语言列表随窗口创建带来),故先立即生效再落盘,
    // 与外观方案同规矩:不留「设置页已变、别处没变」的中间态
    const eff = effectiveLanguage(next, window.agentshed.systemLanguages)
    touchedPrefs.current.add('language')
    setLangPref(next)
    setLang(eff)
    applyLang(eff)
    // 提示用**切换后**的语言写,否则刚切到法语却弹一句中文
    const nt = dictOf(eff)
    toast(
      'ok',
      next === 'system'
        ? nt.toast.languageFollowSystem(nt.languageName)
        : nt.toast.languageSwitched(nt.languageName)
    )
    try {
      const p = await window.agentshed.setLanguage(next)
      setLangPref(p.language)
    } catch (e) {
      toast('err', `保存语言失败:${String(e)}`)
    }
  }

  return (
    <div className={`app dim-${dim}`}>
      <nav className="rail">
        <button
          className={`ri ${dim === 'agents' ? 'on' : ''}`}
          title={t.rail.agents}
          onClick={() => setDim('agents')}
        >
          🤖
        </button>
        <button
          className={`ri ${dim === 'projects' ? 'on' : ''}`}
          title={t.rail.projects}
          onClick={() => setDim('projects')}
        >
          📁
        </button>
        <button
          className={`ri grfr ${refreshing ? 'busy' : ''}`}
          title={t.rail.refresh}
          onClick={() => void refresh()}
        >
          ↻
        </button>
        <button
          className={`ri set ${dim === 'settings' ? 'on' : ''}`}
          title={t.rail.settings}
          onClick={() => setDim('settings')}
        >
          ⚙️
        </button>
      </nav>
      <main className="stage">
        {dim === 'settings' ? (
          <SettingsPane
              scheme={scheme}
              onScheme={(s) => void onScheme(s)}
              mode={mode}
              onMode={(m) => void onMode(m)}
              language={langPref}
              effectiveLang={lang}
              onLanguage={(l) => void onLanguage(l)}
            />
        ) : dim === 'agents' ? (
          snap === null ? (
            <ScanningHint />
          ) : (
            <AgentsPane snap={snap} />
          )
        ) : snap === null ? (
          <ScanningHint />
        ) : (
          <ProjectsPane
            snap={snap}
            selected={selected}
            onSelect={selectProject}
            detail={
              selected && openSession ? (
                <SessionPane
                  file={openSession}
                  focusQ={openFocusQ}
                  projectName={snap.projects.find((p) => p.path === selected)?.name ?? selected}
                  now={snap.scannedAt}
                  onBack={() => {
                    setOpenSession(null)
                    setOpenFocusQ(null)
                    setBackToSessions(true)
                  }}
                  onOpenSession={(f) => {
                    setOpenSession(f)
                    setOpenFocusQ(null)
                  }}
                />
              ) : selected ? (
                <DetailPane
                  snap={snap}
                  path={selected}
                  initialTab={backToSessions ? 'sessions' : undefined}
                  onOpenSession={(f, q) => {
                    setOpenSession(f)
                    setOpenFocusQ(q ?? null)
                    setBackToSessions(false)
                  }}
                />
              ) : (
                <div className="empty">
                  <div className="big">👈</div>
                  <div>选择一个项目查看详情</div>
                </div>
              )
            }
          />
        )}
      </main>
      <Toasts />
    </div>
  )
}

function ScanningHint(): JSX.Element {
  return (
    <div className="empty">
      <div className="big">🛖</div>
      <div>正在扫描 Claude Code / Codex…(扫描完成前不显示空列表)</div>
    </div>
  )
}
