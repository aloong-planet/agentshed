// The UI language selector: a label + a dropdown trigger, opening into a seven-item overlay (follow
// system + six languages).
//
// The overlay is positioned **fixed** and aligned to the trigger's rect: the settings page container is
// overflow:auto,
// which clips an ordinary absolutely positioned element (a same-sized element was used as a negative
// control in the prototype, and it was indeed clipped).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { LANGUAGES, dictOf, type Language, type LanguagePreference } from '@shared/i18n'
import { ChevronDown, Check } from './icons'
import { useAnchorInvalidation } from './useAnchorInvalidation'

/** The value domain: 'system' is a policy, the rest lock a specific language */
const OPTIONS: readonly LanguagePreference[] = ['system', ...LANGUAGES]

export function LanguageSelect({
  pref,
  effective,
  onChange
}: {
  pref: LanguagePreference
  /** The currently effective language — the "follow system" item shows which language it resolves to */
  effective: Language
  onChange: (next: LanguagePreference) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const trigRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // The keyboard listener is installed and removed only on open and close, and the current cursor Enter
  // needs to read goes through a ref — this avoids making the effect depend on
  // cursor and reinstalling the listener on every move.
  const cursorRef = useRef(0)
  // eslint-disable-next-line react-hooks/refs -- see #197
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
  const pick = useCallback(
    (o: LanguagePreference): void => {
      setOpen(false)
      trigRef.current?.focus()
      if (o !== pref) onChange(o)
    },
    [pref, onChange]
  )

  /**
   * Align to the trigger: right edges aligned, opening upwards when there is not enough space below.
   *
   * Unlike the other two anchored layers this one measures **itself** — right-aligning needs its own
   * width, and the flip needs its own height — so placement happens after render, in a layout effect
   * so the first paint is already in the right place.
   */
  const place = useCallback((): void => {
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
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  // Repositioned rather than closed on resize: the user is part-way through choosing a language.
  // Scrolling still dismisses, and now via the shared hook — this component's own capture-phase
  // listener was the pattern the other two layers were missing, so it moved into the hook rather
  // than being duplicated a third time.
  useAnchorInvalidation(open, popRef, {
    onResize: 'reposition',
    dismiss: () => setOpen(false),
    reposition: place
  })

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
    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
    }
  }, [open, pick])

  return (
    // .field / .frow are the settings page's row forms, shared with the appearance section (the language
    // section has only one row)
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
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- see #195
            open ? setOpen(false) : openPop()
          }}
          onKeyDown={(e) => {
            if (open) return
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              // The keystroke that opened it must not also bubble to the overlay's navigation listener,
              // or one press would both open and move a step, leaving the highlight off the current
              // selection
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
                {/* The divider: "follow system" is a policy and the six after it are values — different
                    in kind */}
                {o === 'system' && <div className="lang-sep" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
