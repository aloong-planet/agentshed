// 界面语言选择器:标签 + 下拉触发器,展开为七项浮层(跟随系统 + 六语)。
//
// 浮层用 **fixed** 定位并按触发器 rect 贴合:设置页容器是 overflow:auto,
// 普通绝对定位元素会被它裁掉(原型里用同尺寸元素做过反面对照,确实被裁)。
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { LANGUAGES, dictOf, type Language, type LanguagePreference } from '@shared/i18n'
import { ChevronDown, Check } from './icons'

/** 取值域:'system' 是策略,其余是锁定某一语言 */
const OPTIONS: readonly LanguagePreference[] = ['system', ...LANGUAGES]

export function LanguageSelect({
  pref,
  effective,
  onChange
}: {
  pref: LanguagePreference
  /** 当前生效语言——「跟随系统」项要显示它解析成了哪种语言 */
  effective: Language
  onChange: (next: LanguagePreference) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const trigRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // 键盘监听只在开合时装卸一次,回车要读的当前游标走 ref——避免让 effect 依赖
  // cursor 而在每次移动时装卸一遍监听器。
  const cursorRef = useRef(0)
  cursorRef.current = cursor
  const t = dictOf(effective)

  const mainLabel = (o: LanguagePreference): string =>
    o === 'system' ? t.settings.followSystem : dictOf(o).languageName
  const sideLabel = (o: LanguagePreference): string =>
    o === 'system' ? dictOf(effective).languageName : dictOf(o).languageNameEn

  function openPop(): void {
    setCursor(Math.max(0, OPTIONS.indexOf(pref)))
    setOpen(true)
  }
  function closePop(): void {
    setOpen(false)
    trigRef.current?.focus()
  }
  function pick(o: LanguagePreference): void {
    setOpen(false)
    trigRef.current?.focus()
    if (o !== pref) onChange(o)
  }

  // 贴合触发器:右缘对齐,下方空间不足时向上展开
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const trig = trigRef.current
      const pop = popRef.current
      if (!trig || !pop) return
      const r = trig.getBoundingClientRect()
      const h = pop.offsetHeight
      pop.style.left = `${Math.max(8, r.right - pop.offsetWidth)}px`
      pop.style.top =
        window.innerHeight - r.bottom >= h + 12
          ? `${r.bottom + 6}px`
          : `${Math.max(8, r.top - h - 6)}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closePop()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => (c + 1) % OPTIONS.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => (c - 1 + OPTIONS.length) % OPTIONS.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const o = OPTIONS[cursorRef.current]
        if (o) pick(o)
      }
    }
    const onClick = (e: MouseEvent): void => {
      const el = e.target as Node
      if (!popRef.current?.contains(el) && !trigRef.current?.contains(el)) setOpen(false)
    }
    // 设置页滚动时浮层会脱锚(fixed 不跟随滚动容器),直接关闭
    const onScroll = (): void => setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, pref])

  return (
    // .field / .frow 是设置页的行形态,与外观段共用同一套(语言段只有一行)
    <div className="field">
      <div className="frow">
        <span className="flabel">{t.settings.interfaceLanguage}</span>
        <button
          type="button"
          className="lang-trigger"
          ref={trigRef}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="language-trigger"
          onClick={(e) => {
            e.stopPropagation()
            open ? setOpen(false) : openPop()
          }}
          onKeyDown={(e) => {
            if (open) return
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              // 打开用的这一下不得再冒泡给浮层的导航监听器,
              // 否则同一次按键既打开又移动一格,高亮落不到当前选中项上
              e.preventDefault()
              e.stopPropagation()
              openPop()
            }
          }}
        >
          <span className="cur">
            {mainLabel(pref)}
            {pref === 'system' && <span className="eff">{dictOf(effective).languageName}</span>}
          </span>
          <span className="chev">
            <ChevronDown />
          </span>
        </button>

        {open && (
          <div className="lang-pop" ref={popRef} role="listbox" data-testid="language-pop">
            {OPTIONS.map((o, i) => (
              <div key={o}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o === pref}
                  className={`lang-opt${o === pref ? ' on' : ''}${i === cursor ? ' cursor' : ''}`}
                  data-lang={o}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(o)}
                >
                  <span className="n">{mainLabel(o)}</span>
                  <span className="e">{sideLabel(o)}</span>
                  <span className="ck">
                    <Check />
                  </span>
                </button>
                {/* 分隔线:「跟随系统」是策略,其后六项是取值,性质不同 */}
                {o === 'system' && <div className="lang-sep" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
