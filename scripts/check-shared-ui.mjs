#!/usr/bin/env node
// 共享 UI 一致性检查:把"同一视觉块出现在哪些地方、必须满足什么"变成可执行断言,
// 不再依赖人肉枚举使用点。挂在 pnpm verify 里,漏改即报错。
//
// 加新规则的方式:往 RULES 里加一条;规则本身就是那份"使用点清单"。
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)

/** 列出所有原型 HTML(新增原型自动纳入检查,不必改本脚本) */
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

const RULES = [
  {
    name: '原型的趋势图必须用共享件(禁止各页复制一份实现)',
    check() {
      const bad = []
      for (const f of prototypeHtmls()) {
        const src = read(f) ?? ''
        if (!src.includes('class="chart"') && !src.includes("class='chart'")) continue
        if (!src.includes('_shared/trend-chart.css') || !src.includes('_shared/trend-chart.js')) {
          bad.push(`${f}:含 .chart 却未引用 _shared/trend-chart.{css,js}`)
        }
        if (!src.includes('xaxis')) bad.push(`${f}:趋势图缺 x 轴日期容器`)
        if (!src.includes('legend')) bad.push(`${f}:趋势图缺图例容器`)
      }
      return bad
    }
  },
  {
    name: '共享趋势件不得让柱体裁剪(否则 tooltip 伪元素被切掉)',
    check() {
      const css = read('docs/prototypes/_shared/trend-chart.css') ?? ''
      const appCss = read('src/renderer/src/theme.css') ?? ''
      const bad = []
      const colBlock = (s) => (s.match(/\.col\s*\{[^}]*\}/g) ?? []).join('\n')
      if (/overflow:\s*hidden/.test(colBlock(css))) bad.push('原型共享 CSS:.col 不得 overflow:hidden')
      if (/overflow:\s*hidden/.test(colBlock(appCss))) bad.push('app theme.css:.col 不得 overflow:hidden')
      return bad
    }
  },
  {
    name: 'app 的 TrendChart 每个使用点都要传 archivedDays(否则该处看不到归档段)',
    check() {
      const bad = []
      for (const f of ['src/renderer/src/AgentsPane.tsx', 'src/renderer/src/DetailPane.tsx']) {
        const src = read(f) ?? ''
        const uses = src.match(/<TrendChart[^/]*\/>/gs) ?? []
        for (const u of uses) {
          if (!u.includes('archivedDays')) bad.push(`${f}:<TrendChart> 缺 archivedDays`)
        }
      }
      return bad
    }
  },
  {
    name: 'provider 品牌色只在一处定义(app 与原型各一份变量表,禁止散落硬编码)',
    check() {
      const bad = []
      const BRAND = ['#d97757', '#10a37f', '#4285f4']
      for (const f of ['src/renderer/src/TokenViz.tsx', 'src/renderer/src/DetailPane.tsx', 'src/renderer/src/AgentsPane.tsx']) {
        const src = (read(f) ?? '').toLowerCase()
        for (const c of BRAND) {
          if (src.includes(c)) bad.push(`${f}:硬编码品牌色 ${c},应走 CSS 变量`)
        }
      }
      return bad
    }
  }
]

let failed = 0
for (const r of RULES) {
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
  console.error(`\n共享 UI 检查失败:${failed} 项。以上每条都对应"某处该改没改"。`)
  process.exit(1)
}
console.log('\n共享 UI 一致性检查通过')
