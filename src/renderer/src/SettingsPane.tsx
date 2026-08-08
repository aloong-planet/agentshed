// 设置第三维 · 界面语言 + 外观(模式 × 配色),均对全 app 生效。
// 界面点对齐原型 docs/prototypes/appearance/prototype-settings.html(2026-08-08 已确认)。
// 语言分节置于外观之前:它决定本页其余内容怎么读。
import { useEffect, useState, type JSX } from 'react'
import {
  APPEARANCE_MODES,
  APPEARANCE_SCHEMES,
  type AppearanceMode,
  type AppearanceScheme
} from '@shared/appearance'
import { dictOf, type Language, type LanguagePreference } from '@shared/i18n'
import { LanguageSelect } from './LanguageSelect'

// 色板预览取样(--card / --accent-soft / --accent / --text),按生效明暗**两套**:
// 色板是所见即所得的预览,深色下仍显示浅色取样就与实际观感不符。
// 值抄自 theme.css 的各变量块,**改主题色须同步改这里**——没法在运行时读出来,
// getComputedStyle 只能读当前生效的那一套,读不到另外两个方案的变量。
const SCHEME_SWATCH: Record<'light' | 'dark', Record<AppearanceScheme, string[]>> = {
  light: {
    purple: ['#ffffff', '#f0ebf6', '#8a67ab', '#37352f'],
    blue: ['#fffcf9', '#eef2f7', '#4a6fa5', '#2c2a28'],
    amber: ['#fffcf7', '#f3ead4', '#6b5220', '#3a342c']
  },
  dark: {
    purple: ['#1f2124', '#2c2733', '#a084c7', '#e6e6e5'],
    blue: ['#1c1f24', '#1e2a38', '#7a9dc4', '#e6e4e0'],
    amber: ['#221e1a', '#2e2820', '#c4a46a', '#ebe4d8']
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * 当前**生效明暗**。
 *
 * 主进程按偏好设 `nativeTheme.themeSource`,它直接改变这个媒体查询的求值结果——
 * 故渲染层不自己算明暗、也不写 DOM 属性,读它即可;监听 change 便同时覆盖了
 * 「用户改模式」与「跟随系统时系统外观变了」两种来源,不必分别接线。
 */
function useEffectiveDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (): void => setDark(mq.matches)
    // 挂监听与读初值之间可能已经变过一次,补读一次免得停在旧值
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

export function SettingsPane({
  scheme,
  onScheme,
  mode,
  onMode,
  language,
  effectiveLang,
  onLanguage
}: {
  scheme: AppearanceScheme
  onScheme: (s: AppearanceScheme) => void
  mode: AppearanceMode
  onMode: (m: AppearanceMode) => void
  language: LanguagePreference
  effectiveLang: Language
  onLanguage: (l: LanguagePreference) => void
}): JSX.Element {
  const t = dictOf(effectiveLang).settings
  const dark = useEffectiveDark()
  const schemeName: Record<AppearanceScheme, string> = {
    purple: t.schemePurple,
    blue: t.schemeBlue,
    amber: t.schemeAmber
  }
  // 「跟随系统」与语言分节共用同一条文案:两处是同构的策略,措辞不该各说各的
  const modeName: Record<AppearanceMode, string> = {
    system: t.followSystem,
    light: t.modeLight,
    dark: t.modeDark
  }
  const swatch = SCHEME_SWATCH[dark ? 'dark' : 'light']

  return (
    <div className="settings">
      <h1 className="settings-h1">{t.title}</h1>
      <p className="settings-lead">{t.lead}</p>

      <div className="settings-sec-t">{t.sectionLanguage}</div>
      <LanguageSelect pref={language} effective={effectiveLang} onChange={onLanguage} />
      <p className="settings-foot" data-testid="language-foot">{t.languageFoot}</p>

      <div className="settings-sec-t settings-sec-gap">{t.sectionAppearance}</div>
      {/* 一张卡两行:上行模式、下行配色,与语言段同一形态 */}
      <div className="field" data-testid="appearance-field">
        <div className="frow">
          <span className="flabel">{t.mode}</span>
          <span className="seg seg-field" role="radiogroup" aria-label={t.mode} data-testid="mode-seg">
            {APPEARANCE_MODES.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={mode === id}
                data-mode-option={id}
                className={mode === id ? 'on' : ''}
                onClick={() => onMode(id)}
              >
                {modeName[id]}
              </button>
            ))}
          </span>
        </div>
        <div className="frow">
          <span className="flabel">{t.palette}</span>
          <div className="scheme-grid" role="radiogroup" aria-label={t.palette}>
            {APPEARANCE_SCHEMES.map((id) => (
              <button
                type="button"
                key={id}
                role="radio"
                aria-checked={scheme === id}
                data-scheme-option={id}
                className={`scheme-card ${scheme === id ? 'on' : ''}`}
                onClick={() => onScheme(id)}
              >
                <span className="scheme-swatches">
                  {swatch[id].map((c) => (
                    <span key={c} className="scheme-sw" style={{ background: c }} />
                  ))}
                </span>
                <span className="scheme-name">{schemeName[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {/* 紧凑化后配色卡不再带描述,「默认为紫」等信息落在这段说明里 */}
      <p className="settings-foot" data-testid="appearance-foot">{t.appearanceFoot}</p>
    </div>
  )
}
