#!/usr/bin/env node
// 共享 UI 一致性检查:把"某个共享视觉块出现在哪些地方、必须满足什么"变成可执行断言,
// 不再依赖人肉枚举使用点。挂在 pnpm verify 里,漏改即报错。
//
// 识别键是**块身份**而非通用类名:页面用 data-shared-block="<id>" 声明"我用了这个块",
// 因此同一页可以有多种图表(趋势/饼图/折线…),各自声明各自的 id,互不干扰。
//
// 新增一种共享块 = 往 SHARED_BLOCKS 加一条;新增一个使用点 = 在页面加声明属性。
// 两者都不需要改本脚本的逻辑。
//
// ── 检查分档(与"先原型、确认后实现"的工作流对齐)──
//   默认:只查**原型侧**规则。原型改完等用户确认期间,真代码尚未跟进是预期状态,
//         此时报"原型与 app 不一致"是噪音,红久了会被忽略(破窗)。
//   --cross:加查**原型↔真代码一致性**(CSS 不变量在 app 侧的部分、组件必需 props)。
//         落实现之后跑,也是 pnpm verify 里跑的档位。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

/** 共享块注册表:每条描述一种可复用的视觉块及其契约 */
const SHARED_BLOCKS = [
  {
    id: 'trend-chart',
    label: 'provider stacked trend chart',
    /** 声明使用它的页面必须引用的资源 */
    assets: ['_shared/trend-chart.css', '_shared/trend-chart.js'],
    /** 声明使用它的页面必须具备的挂载点(以 id 属性出现) */
    containers: ['xaxis', 'legend'],
    /** 该块的样式不变量:选择器 → 禁止出现的声明(附原因) */
    cssInvariants: [
      {
        files: ['docs/prototypes/_shared/trend-chart.css', 'src/renderer/src/theme.css'],
        selector: '.col',
        forbid: /overflow:\s*hidden/,
        why: 'clipping the bar cuts off the tooltip pseudo-element positioned outside it'
      }
    ],
    /** app 侧对应组件与必需 props */
    appComponent: { name: 'TrendChart', requiredProps: ['archivedDays'] }
  }
]

// ── 设置页色板取样 ↔ theme.css 的一致性(issue #59)──
// 设置页的三张配色卡各画 4 个色块,取样口径是 --card / --accent-soft / --accent / --text,
// 按生效明暗两套。这 24 个值只能**手抄**:getComputedStyle 在运行时只读得到当前生效的
// 那一套变量,读不到另外两个方案、另一种明暗的值,TS 也 import 不了 CSS 变量。
// 于是"改了主题色却漏改取样表"没有任何东西会红——色板预览与实际观感不符,且是静默的。
// 这条规则就是那个"会红的东西"。

/** 取样口径:色块从左到右依次取这四个变量,顺序即语义 */
const SWATCH_VARS = ['card', 'accent-soft', 'accent', 'text']
/** 三个配色方案在 theme.css 里的选择器(浅色块与深色块共用同一组选择器) */
const SCHEME_SELECTORS = {
  purple: ':root',
  blue: "html[data-scheme='blue']",
  amber: "html[data-scheme='amber']"
}

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/** 从 open(某个 `{` 或 `[` 的下标)起做括号配对,返回其内部文本;不配对返回 null */
function balancedBody(src, open) {
  const pairs = { '{': '}', '[': ']' }
  const close = pairs[src[open]]
  if (!close) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === src[open]) depth++
    else if (src[i] === close) {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return null
}

/** 取字面选择器/键名后紧跟的那个块的内部文本 */
function bodyAfter(src, literal, opener = '{') {
  const at = src.indexOf(literal)
  if (at < 0) return null
  const open = src.indexOf(opener, at + literal.length)
  return open < 0 ? null : balancedBody(src, open)
}

/**
 * 把 theme.css 拆成「深色媒体查询内」与「其余」两部分。
 * theme.css 里不止一处 `@media (prefers-color-scheme: dark)`(另有 mark / 提问定位等四处),
 * 故不能只取第一处:深色部分取全部媒体块的**并集**,浅色部分是把它们整段挖掉后的剩余。
 */
function splitByColorScheme(css) {
  const re = /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/g
  let darkParts = ''
  let light = ''
  let cursor = 0
  let m
  while ((m = re.exec(css))) {
    const open = css.indexOf('{', m.index + m[0].length - 1)
    const body = balancedBody(css, open)
    if (body === null) continue
    const end = open + 1 + body.length + 1
    light += css.slice(cursor, m.index)
    darkParts += `\n${body}`
    cursor = end
    re.lastIndex = end
  }
  light += css.slice(cursor)
  return { light, dark: darkParts }
}

/** 从一段 CSS 文本里取某选择器块下的四个取样变量值 */
function swatchFromCss(cssPart, selector) {
  const body = bodyAfter(cssPart, selector)
  if (body === null) return null
  return SWATCH_VARS.map((v) => {
    const m = body.match(new RegExp(`--${v}\\s*:\\s*([^;]+);`))
    return m ? m[1].trim().toLowerCase() : null
  })
}

/** 从 SettingsPane 的 SCHEME_SWATCH 里取某明暗某方案的四个值 */
function swatchFromTsx(tsx, mode, scheme) {
  const table = bodyAfter(tsx, 'SCHEME_SWATCH')
  if (table === null) return null
  const modeBody = bodyAfter(table, `${mode}:`)
  if (modeBody === null) return null
  const arr = bodyAfter(modeBody, `${scheme}:`, '[')
  if (arr === null) return null
  return arr
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .filter((s) => s.length > 0)
}

/** 全局规则:与具体块无关的通用约束 */
const GLOBAL_RULES = [
  {
    // 票 15 的 AC「任一入口都能到达其余五种」是**可判定属性**,故固化成门禁而非靠肉眼看
    // (2026-08-09 用户裁定)。它防的是:新增语种或改文件名时,漏补其余文件里的链接——
    // 那种漏没有任何别的东西会提醒,而读者只有点到死链才会发现。
    name: 'READMEs in six languages reach each other (any entry point leads to the other five)',
    check() {
      const bad = []
      const FILES = ['README.md', 'README.en.md', 'README.fr.md', 'README.es.md', 'README.ru.md', 'README.ja.md']
      for (const f of FILES) {
        const src = read(f)
        if (src === null) {
          bad.push(`missing ${f}`)
          continue
        }
        const linked = new Set([...src.matchAll(/\]\((README[^)]*\.md)\)/g)].map((m) => m[1]))
        for (const other of FILES) {
          if (other !== f && !linked.has(other)) bad.push(`${f}: no link to ${other}`)
        }
        // 当前语言应是**唯一**的粗体项:零个 = 读者不知道自己在哪份,多个 = 复制粘贴时漏改
        const nav = src.split('\n').find((l) => l.includes('README.en.md') || l.includes('README.md)')) ?? ''
        const bold = (nav.match(/\*\*[^*]+\*\*/g) ?? []).length
        if (bold !== 1) bad.push(`${f}: the language switcher must have exactly one bold entry (found ${bold})`)
      }
      return bad
    }
  },
  {
    name: 'settings palette swatches match theme.css variables (changing a theme colour must update the swatch table)',
    cross: true,
    check() {
      const bad = []
      const cssRaw = read('src/renderer/src/theme.css')
      const tsx = read('src/renderer/src/SettingsPane.tsx')
      // 读不到文件本身就是问题:静默跳过等于这条规则在文件被改名后自动失效
      if (cssRaw === null) return ['cannot read src/renderer/src/theme.css']
      if (tsx === null) return ['cannot read src/renderer/src/SettingsPane.tsx']
      const { light, dark } = splitByColorScheme(stripCssComments(cssRaw))
      for (const [mode, part] of [['light', light], ['dark', dark]]) {
        for (const [scheme, selector] of Object.entries(SCHEME_SELECTORS)) {
          const want = swatchFromCss(part, selector)
          const got = swatchFromTsx(tsx, mode, scheme)
          if (want === null || want.some((v) => v === null)) {
            bad.push(`theme.css: ${mode}.${scheme} (${selector}) is missing some of ${SWATCH_VARS.join('/')}`)
            continue
          }
          if (got === null) {
            bad.push(`SettingsPane.tsx: SCHEME_SWATCH.${mode}.${scheme} not found`)
            continue
          }
          if (got.length !== want.length) {
            bad.push(`${mode}.${scheme}: ${got.length} swatch(es) but theme.css has ${want.length} variables`)
            continue
          }
          want.forEach((w, i) => {
            if (w !== got[i]) {
              bad.push(`${mode}.${scheme} swatch ${i + 1} (--${SWATCH_VARS[i]}): theme.css=${w}, swatch table=${got[i]}`)
            }
          })
        }
      }
      return bad
    }
  },
  {
    name: 'provider brand colours must not be hard-coded in components (use CSS variables)',
    cross: true,
    check() {
      const bad = []
      const BRAND = ['#d97757', '#10a37f', '#4285f4']
      for (const f of ['src/renderer/src/TokenViz.tsx', 'src/renderer/src/DetailPane.tsx', 'src/renderer/src/AgentsPane.tsx']) {
        const src = (read(f) ?? '').toLowerCase()
        for (const c of BRAND) if (src.includes(c)) bad.push(`${f}: hard-coded ${c}`)
      }
      return bad
    }
  },
  {
    // appearance C3:组件只绑 token;设置页 swatch 故意展示各方案样色,排除。
    name: 'components must not hard-code scheme accent colours (use the --accent family)',
    cross: true,
    check() {
      const bad = []
      const SCHEME = ['#8a67ab', '#a084c7', '#4a6fa5', '#3a5a88', '#6b5220', '#c4a46a']
      const dir = join(ROOT, 'src/renderer/src')
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.tsx') && !name.endsWith('.ts')) continue
        if (name === 'SettingsPane.tsx') continue
        const f = `src/renderer/src/${name}`
        const src = (read(f) ?? '').toLowerCase()
        for (const c of SCHEME) if (src.includes(c)) bad.push(`${f}: hard-coded scheme colour ${c}`)
      }
      return bad
    }
  },
  {
    name: 'every chart container in a prototype must declare its shared block (otherwise consistency cannot be checked)',
    check() {
      const bad = []
      for (const f of prototypeHtmls()) {
        const src = read(f) ?? ''
        const charts = (src.match(/class="[^"]*\bchart\b[^"]*"/g) ?? []).length
        if (charts === 0) continue
        const declared = (src.match(/data-shared-block="[^"]+"/g) ?? []).length
        if (declared < charts) {
          bad.push(`${f}: ${charts} chart container(s) but only ${declared} declare data-shared-block`)
        }
      }
      return bad
    }
  }
]

/** 列出所有原型 HTML(新增原型自动纳入,无需改脚本) */
function prototypeHtmls() {
  const base = join(ROOT, 'docs/prototypes')
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'vendor' || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.html') && e.name !== 'index.html') out.push(p.slice(ROOT.length + 1))
    }
  }
  walk(base)
  return out
}

function checkBlock(block, withCross) {
  const problems = []
  const users = []

  // ① 声明了该块的原型页:必须引用资源、具备挂载点
  for (const f of prototypeHtmls()) {
    const src = read(f) ?? ''
    if (!src.includes(`data-shared-block="${block.id}"`)) {
      // 反向检查:引用了资源却没声明 → 声明遗漏,一致性无从核对
      if (block.assets.some((a) => src.includes(a))) {
        problems.push(`${f}: references ${block.id} assets without declaring data-shared-block="${block.id}"`)
      }
      continue
    }
    users.push(f)
    for (const a of block.assets) {
      if (!src.includes(a)) problems.push(`${f}: declares ${block.id} but does not reference ${a}`)
    }
    for (const c of block.containers) {
      if (!new RegExp(`id="[^"]*${c}[^"]*"`).test(src)) {
        problems.push(`${f}: declares ${block.id} but is missing the ${c} mount point`)
      }
    }
  }

  // ② 样式不变量(app 侧的文件属跨端档)
  for (const inv of block.cssInvariants ?? []) {
    for (const f of inv.files) {
      if (!withCross && !f.startsWith('docs/prototypes/')) continue
      const css = read(f)
      if (css === null) continue
      // 先剥注释再匹配:注释里提及被禁声明(如"不可 overflow:hidden——…")不算违规
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const blocks = stripped.match(new RegExp(`\\${inv.selector}\\s*\\{[^}]*\\}`, 'g')) ?? []
      if (blocks.some((b) => inv.forbid.test(b))) {
        problems.push(`${f}: ${inv.selector} violates an invariant (${inv.why})`)
      }
    }
  }

  // ③ app 侧组件的每个使用点(跨端档)
  if (withCross && block.appComponent) {
    const { name, requiredProps } = block.appComponent
    for (const f of appSources()) {
      const src = read(f) ?? ''
      const uses = src.match(new RegExp(`<${name}[^/]*/>`, 'gs')) ?? []
      for (const u of uses) {
        for (const p of requiredProps) {
          if (!u.includes(p)) problems.push(`${f}: <${name}> is missing ${p}`)
        }
      }
    }
  }
  return { problems, users }
}

/** app 侧所有 tsx(新增使用点自动纳入,无需改脚本) */
function appSources() {
  const base = join(ROOT, 'src/renderer/src')
  if (!existsSync(base)) return []
  return readdirSync(base)
    .filter((n) => n.endsWith('.tsx'))
    .map((n) => join('src/renderer/src', n))
}

const withCross = process.argv.includes('--cross')
console.log(
  withCross
    ? 'mode: prototypes + cross-side consistency'
    : 'mode: prototypes only (pass --cross for the cross-side checks, once the implementation has landed)'
)

let failed = 0
for (const block of SHARED_BLOCKS) {
  const { problems, users } = checkBlock(block, withCross)
  if (problems.length) {
    failed += problems.length
    console.error(`✗ shared block ${block.id} (${block.label})`)
    for (const p of problems) console.error(`    ${p}`)
  } else {
    console.log(`✓ shared block ${block.id} (${block.label}) — all ${users.length} usage site(s) compliant`)
  }
}
for (const r of GLOBAL_RULES) {
  if (r.cross && !withCross) continue
  const problems = r.check()
  if (problems.length) {
    failed += problems.length
    console.error(`✗ ${r.name}`)
    for (const p of problems) console.error(`    ${p}`)
  } else {
    console.log(`✓ ${r.name}`)
  }
}
if (failed) {
  console.error(`\nShared-UI check failed: ${failed} problem(s). Each one means something that should have been updated wasn't.`)
  process.exit(1)
}
console.log('\nShared-UI consistency check passed')
