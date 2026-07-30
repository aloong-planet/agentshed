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
    label: 'provider 堆叠趋势图',
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
        why: '柱体裁剪会切掉定位在柱外的 tooltip 伪元素'
      }
    ],
    /** app 侧对应组件与必需 props */
    appComponent: { name: 'TrendChart', requiredProps: ['archivedDays'] }
  }
]

/** 全局规则:与具体块无关的通用约束 */
const GLOBAL_RULES = [
  {
    name: 'provider 品牌色不得在组件里硬编码(应走 CSS 变量)',
    cross: true,
    check() {
      const bad = []
      const BRAND = ['#d97757', '#10a37f', '#4285f4']
      for (const f of ['src/renderer/src/TokenViz.tsx', 'src/renderer/src/DetailPane.tsx', 'src/renderer/src/AgentsPane.tsx']) {
        const src = (read(f) ?? '').toLowerCase()
        for (const c of BRAND) if (src.includes(c)) bad.push(`${f}:硬编码 ${c}`)
      }
      return bad
    }
  },
  {
    name: '原型里的图表容器都要声明所属共享块(否则无法核对一致性)',
    check() {
      const bad = []
      for (const f of prototypeHtmls()) {
        const src = read(f) ?? ''
        const charts = (src.match(/class="[^"]*\bchart\b[^"]*"/g) ?? []).length
        if (charts === 0) continue
        const declared = (src.match(/data-shared-block="[^"]+"/g) ?? []).length
        if (declared < charts) {
          bad.push(`${f}:${charts} 个图表容器,只有 ${declared} 个声明了 data-shared-block`)
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
        problems.push(`${f}:引用了 ${block.id} 的资源却未声明 data-shared-block="${block.id}"`)
      }
      continue
    }
    users.push(f)
    for (const a of block.assets) {
      if (!src.includes(a)) problems.push(`${f}:声明使用 ${block.id} 却未引用 ${a}`)
    }
    for (const c of block.containers) {
      if (!new RegExp(`id="[^"]*${c}[^"]*"`).test(src)) {
        problems.push(`${f}:声明使用 ${block.id} 却缺少 ${c} 挂载点`)
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
        problems.push(`${f}:${inv.selector} 违反不变量(${inv.why})`)
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
          if (!u.includes(p)) problems.push(`${f}:<${name}> 缺 ${p}`)
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
console.log(withCross ? '档位:原型 + 跨端一致性' : '档位:仅原型(跨端检查用 --cross,落实现后再跑)')

let failed = 0
for (const block of SHARED_BLOCKS) {
  const { problems, users } = checkBlock(block, withCross)
  if (problems.length) {
    failed += problems.length
    console.error(`✗ 共享块 ${block.id}(${block.label})`)
    for (const p of problems) console.error(`    ${p}`)
  } else {
    console.log(`✓ 共享块 ${block.id}(${block.label})— 使用点 ${users.length} 处均合规`)
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
  console.error(`\n共享 UI 检查失败:${failed} 项。每条都对应"某处该改没改"。`)
  process.exit(1)
}
console.log('\n共享 UI 一致性检查通过')
