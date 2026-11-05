import { type ElectronApplication } from '@playwright/test'

export type Win = Awaited<ReturnType<ElectronApplication['firstWindow']>>

export type Rgb = [number, number, number]

/** One pixel of the window as drawn, at a CSS position. A scrollbar is no element, so its colour has no computed
 * style to read: the window is captured around the point (at the device's scale) and the capture decoded in the
 * page, where a canvas gives RGBA whatever the platform's bitmap order */
export async function pixelAt(win: Win, x: number, y: number): Promise<Rgb> {
  const png = await win.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1 } })
  return win.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2), 1, 1).data
    return [d[0], d[1], d[2]] as [number, number, number]
  }, png.toString('base64'))
}

/** The colour an area paints beneath its content: the first painted background up its ancestors */
export async function paintedBackground(area: ReturnType<Win['locator']>): Promise<Rgb> {
  return area.evaluate((node) => {
    for (let n: Element | null = node; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor
      if (!/rgba\(.*,\s*0\)$/.test(c) && c !== 'transparent') {
        return (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number) as [number, number, number]
      }
    }
    return [] as unknown as [number, number, number]
  })
}

/** A colour for a failure message */
export function rgb(c: Rgb): string {
  return c.join(',')
}

export function near(got: Rgb, want: Rgb, tolerance = 2): boolean {
  return got.every((v, i) => Math.abs(v - want[i]) <= tolerance)
}

/** The UI's effective light/dark right now: a themeSource change directly changes how this media query
 * evaluates */
export async function effectiveDark(win: Awaited<ReturnType<ElectronApplication['firstWindow']>>): Promise<boolean> {
  return win.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)
}
