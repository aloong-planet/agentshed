import { expect, type ElectronApplication } from '@playwright/test'

/**
 * The rendered-markdown heading ladder (spec appearance.md, sequence E): one ladder on every
 * markdown surface, probed as computed styles — the technique the light/dark cases already use,
 * not screenshot comparison. Sizes are the spec's em table × the 12.5px body both surfaces set.
 */
export async function headingLadder(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<
  Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5', { size: number; color: string; bottomRule: string; leftBar: string }>
> {
  return win.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) throw new Error(`ladder probe: no node for ${sel}`)
    const pick = (h: string) => {
      const el = root.querySelector(h)
      if (!el) throw new Error(`ladder probe: no ${h} under ${sel}`)
      const cs = getComputedStyle(el)
      return {
        size: parseFloat(cs.fontSize),
        color: cs.color,
        bottomRule: cs.borderBottomWidth,
        leftBar: cs.borderLeftWidth
      }
    }
    return { h1: pick('h1'), h2: pick('h2'), h3: pick('h3'), h4: pick('h4'), h5: pick('h5') }
  }, scope)
}

export function expectLadder(l: Awaited<ReturnType<typeof headingLadder>>, label: string): void {
  expect(l.h1.size, `${label}: h1 size`).toBeCloseTo(16.5, 1)
  expect(l.h2.size, `${label}: h2 size`).toBeCloseTo(14.5, 1)
  expect(l.h3.size, `${label}: h3 size`).toBeCloseTo(13.25, 1)
  expect(l.h4.size, `${label}: h4 size`).toBeCloseTo(11.875, 1)
  // Shape cues: the h1 bottom rule and the h2 left bar. Deliberately NOT asserted:
  // borderLeftColor === color — border-color's initial value is currentColor, so that comparison
  // holds even with no border rule at all (a constant-true assertion).
  expect(l.h1.bottomRule, `${label}: h1 bottom rule`).toBe('2px')
  expect(l.h2.leftBar, `${label}: h2 left bar`).toBe('3px')
  // Colour steps: h2 → h3 → h4 all differ, and h4 has left the accent family for the muted grey h5 uses
  expect(l.h3.color, `${label}: h3 differs from h2`).not.toBe(l.h2.color)
  expect(l.h4.color, `${label}: h4 differs from h3`).not.toBe(l.h3.color)
  expect(l.h4.color, `${label}: h4 shares the muted colour with h5`).toBe(l.h5.color)
}

/**
 * Rendered-markdown code styling (spec appearance.md, sequence E): inline code and fenced blocks
 * take the document card's paper style on every surface — a bordered inset for the fence, no inner
 * box on the code element inside it, a bordered pill for inline code.
 */
export async function codeStyle(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<{ preBorder: string; preBg: string; hostBg: string; innerBorder: string; innerBg: string; inlineBorder: string }> {
  return win.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) throw new Error(`code probe: no node for ${sel}`)
    const pre = root.querySelector('pre')
    const preCode = root.querySelector('pre code')
    const inline = Array.from(root.querySelectorAll('code')).find((c) => !c.closest('pre'))
    if (!pre || !preCode || !inline) throw new Error(`code probe: pre/code missing under ${sel}`)
    return {
      preBorder: getComputedStyle(pre).borderTopWidth,
      preBg: getComputedStyle(pre).backgroundColor,
      hostBg: getComputedStyle(root).backgroundColor,
      innerBorder: getComputedStyle(preCode).borderTopWidth,
      innerBg: getComputedStyle(preCode).backgroundColor,
      inlineBorder: getComputedStyle(inline).borderTopWidth
    }
  }, scope)
}

/** Body line-height is part of the shared rule set too (spec appearance E7c, settled 2026-08-20 at
 * the document card's 1.75): probed on a paragraph, 1.75 × the 12.5px body = 21.875px. */
export async function contentLineHeight(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<number> {
  return win.evaluate((sel) => {
    const p = document.querySelector(`${sel} p`)
    if (!p) throw new Error(`line-height probe: no p under ${sel}`)
    return parseFloat(getComputedStyle(p).lineHeight)
  }, scope)
}

/** Tables take the paper style too (spec appearance E7d, settled 2026-08-21): a bordered frame,
 * an accent-soft header with deep-accent text, bg-striped even rows, and GFM alignment
 * (:-: / --:) winning over the default left. */
export async function tableStyle(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<{
  border: string
  thColor: string
  thNowrap: string
  thAlign: string
  colSep: string
  rowSep: string
  oddBg: string
  evenBg: string
  alignRight: string
  alignCenter: string
}> {
  return win.evaluate((sel) => {
    const table = document.querySelector(`${sel} table`)
    if (!table) throw new Error(`table probe: no table under ${sel}`)
    const th = table.querySelector('th')
    const rows = table.querySelectorAll('tbody tr')
    const oddTd = rows[0]?.querySelector('td')
    const evenTd = rows[1]?.querySelector('td')
    const rightTd = rows[0]?.querySelector('td:last-child')
    const centerTd = rows[0]?.querySelector('td:nth-child(2)')
    if (!th || !oddTd || !evenTd || !rightTd || !centerTd)
      throw new Error(`table probe: cells missing under ${sel}`)
    return {
      border: getComputedStyle(table).borderTopWidth,
      thColor: getComputedStyle(th).color,
      thNowrap: getComputedStyle(th).whiteSpace,
      thAlign: getComputedStyle(th).textAlign,
      colSep: getComputedStyle(oddTd).borderRightColor,
      rowSep: getComputedStyle(oddTd).borderBottomColor,
      oddBg: getComputedStyle(oddTd).backgroundColor,
      evenBg: getComputedStyle(evenTd).backgroundColor,
      alignRight: getComputedStyle(rightTd).textAlign,
      alignCenter: getComputedStyle(centerTd).textAlign
    }
  }, scope)
}

export function expectTableStyle(
  tb: Awaited<ReturnType<typeof tableStyle>>,
  h1Color: string,
  label: string
): void {
  expect(tb.border, `${label}: table frame`).toBe('1px')
  expect(tb.thColor, `${label}: header text takes the deep accent (h1's colour)`).toBe(h1Color)
  expect(tb.thNowrap, `${label}: header cells never wrap`).toBe('nowrap')
  // Ruled 2026-08-21: headers are always centred; GFM alignment applies to body cells only —
  // the attribute lands on th too, and without this rule it drags the header along
  expect(tb.thAlign, `${label}: header text centred regardless of column alignment`).toBe('center')
  expect(tb.colSep, `${label}: column separators stronger than row separators`).not.toBe(tb.rowSep)
  expect(tb.evenBg, `${label}: striped even row`).not.toBe(tb.oddBg)
  expect(tb.alignRight, `${label}: GFM right alignment wins`).toBe('right')
  expect(tb.alignCenter, `${label}: GFM centre alignment wins`).toBe('center')
}

/** List indentation is part of the shared rule set (spec appearance E7c): 20px on every surface —
 * the drawer previously fell to the browser's 40px default. */
export async function listIndent(
  win: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  scope: string
): Promise<string> {
  return win.evaluate((sel) => {
    const ul = document.querySelector(`${sel} ul`)
    if (!ul) throw new Error(`list probe: no ul under ${sel}`)
    return getComputedStyle(ul).paddingLeft
  }, scope)
}

export function expectCodeStyle(c: Awaited<ReturnType<typeof codeStyle>>, label: string): void {
  expect(c.preBorder, `${label}: fenced block border`).toBe('1px')
  expect(c.preBg, `${label}: fenced block is a paper inset, not the host background`).not.toBe(c.hostBg)
  expect(c.innerBorder, `${label}: no inner box on the code element inside the fence`).toBe('0px')
  expect(c.innerBg, `${label}: inner code transparent`).toBe('rgba(0, 0, 0, 0)')
  expect(c.inlineBorder, `${label}: inline code pill border`).toBe('1px')
}
