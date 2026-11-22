// A stylesheet's palette as it declares it: the light appearance's tokens and the dark one's. The palette test compares
// the page's with the app's; the browser cases take from it what each appearance should paint the page with.
import { readFileSync } from 'node:fs'
import postcss, { type Root } from 'postcss'

/** The custom properties of a stylesheet's top-level `:root`, and of its `:root` under the dark media query */
export function palette(file: URL): { light: Map<string, string>; dark: Map<string, string> } {
  const root: Root = postcss.parse(readFileSync(file, 'utf8'))
  const light = new Map<string, string>()
  const dark = new Map<string, string>()
  root.walkRules(':root', (rule) => {
    const parent = rule.parent
    const target =
      parent?.type === 'root'
        ? light
        : parent?.type === 'atrule' && parent.name === 'media' && /prefers-color-scheme:\s*dark/.test(parent.params)
          ? dark
          : null
    rule.walkDecls(/^--/, (d) => {
      target?.set(d.prop, d.value.replace(/\s+/g, ' ').toLowerCase())
    })
  })
  return { light, dark }
}
