// 设置第三维 · 外观方案(全 app)。界面点对齐原型 docs/prototypes/appearance。
import {
  APPEARANCE_SCHEMES,
  SCHEME_LABEL,
  type AppearanceScheme
} from '@shared/appearance'

const SCHEME_DESC: Record<AppearanceScheme, string> = {
  purple: '现网品牌紫。安装后的默认外观。',
  blue: '暖灰纸底 + 冷静蓝强调，适合长时间阅读。',
  amber: '暖纸底 + 褐强调，更接近纸书质感。'
}

// swatch 仅作方案卡示意色,不参与运行时主题计算
const SCHEME_SWATCH: Record<AppearanceScheme, string[]> = {
  purple: ['#ffffff', '#f0ebf6', '#8a67ab', '#2c2733'],
  blue: ['#fffcf9', '#eef2f7', '#4a6fa5', '#2b303b'],
  amber: ['#fffcf7', '#f3ead4', '#6b5220', '#2f2c28']
}

export function SettingsPane({
  scheme,
  onScheme
}: {
  scheme: AppearanceScheme
  onScheme: (s: AppearanceScheme) => void
}): JSX.Element {
  return (
    <div className="settings">
      <h1 className="settings-h1">设置</h1>
      <p className="settings-lead">本 app 偏好，对整个界面生效。不写入 Claude / Codex 配置。</p>

      <div className="settings-sec-t">外观</div>
      <div className="scheme-grid" role="radiogroup" aria-label="外观方案">
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
                  {SCHEME_LABEL[id]}
                  {id === 'purple' ? <span className="scheme-badge">默认</span> : null}
                </span>
                <span className="scheme-desc">{SCHEME_DESC[id]}</span>
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
      <p className="settings-foot">
        <b>浅色 / 深色</b>跟随 macOS 系统外观。切换方案后立即生效，无需保存。
      </p>
    </div>
  )
}
