// 设置第三维 · 界面语言 + 外观方案(均对全 app 生效)。界面点对齐原型 docs/prototypes/appearance。
// 语言分节置于外观之前:它决定本页其余内容怎么读。
import type { JSX } from 'react'
import { APPEARANCE_SCHEMES, type AppearanceScheme } from '@shared/appearance'
import { dictOf, type Language, type LanguagePreference } from '@shared/i18n'
import { LanguageSelect } from './LanguageSelect'

// swatch 仅作方案卡示意色,不参与运行时主题计算
const SCHEME_SWATCH: Record<AppearanceScheme, string[]> = {
  purple: ['#ffffff', '#f0ebf6', '#8a67ab', '#2c2733'],
  blue: ['#fffcf9', '#eef2f7', '#4a6fa5', '#2b303b'],
  amber: ['#fffcf7', '#f3ead4', '#6b5220', '#2f2c28']
}

export function SettingsPane({
  scheme,
  onScheme,
  language,
  effectiveLang,
  onLanguage
}: {
  scheme: AppearanceScheme
  onScheme: (s: AppearanceScheme) => void
  language: LanguagePreference
  effectiveLang: Language
  onLanguage: (l: LanguagePreference) => void
}): JSX.Element {
  const t = dictOf(effectiveLang).settings
  const schemeName: Record<AppearanceScheme, string> = {
    purple: t.schemePurple,
    blue: t.schemeBlue,
    amber: t.schemeAmber
  }
  const schemeDesc: Record<AppearanceScheme, string> = {
    purple: t.schemePurpleDesc,
    blue: t.schemeBlueDesc,
    amber: t.schemeAmberDesc
  }

  return (
    <div className="settings">
      <h1 className="settings-h1">{t.title}</h1>
      <p className="settings-lead">{t.lead}</p>

      <div className="settings-sec-t">{t.sectionLanguage}</div>
      <LanguageSelect pref={language} effective={effectiveLang} onChange={onLanguage} />
      <p className="settings-foot" data-testid="language-foot">{t.languageFoot}</p>

      <div className="settings-sec-t settings-sec-gap">{t.sectionAppearance}</div>
      <div className="scheme-grid" role="radiogroup" aria-label={t.sectionAppearance}>
        {APPEARANCE_SCHEMES.map((id) => {
          const on = scheme === id
          return (
            <button
              type="button"
              key={id}
              role="radio"
              aria-checked={on}
              data-scheme-option={id}
              className={`scheme-card ${on ? 'on' : ''}`}
              onClick={() => onScheme(id)}
            >
              <span className="scheme-radio" aria-hidden />
              <span className="scheme-body">
                <span className="scheme-name">
                  {schemeName[id]}
                  {id === 'purple' ? <span className="scheme-badge">{t.badgeDefault}</span> : null}
                </span>
                <span className="scheme-desc">{schemeDesc[id]}</span>
                <span className="scheme-swatches">
                  {SCHEME_SWATCH[id].map((c) => (
                    <span key={c} className="scheme-sw" style={{ background: c }} />
                  ))}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="settings-foot" data-testid="appearance-foot">{t.appearanceFoot}</p>
    </div>
  )
}
