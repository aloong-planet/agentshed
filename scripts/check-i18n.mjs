#!/usr/bin/env node
// 文案门禁(票 14):扫源码里**未进字典**的中文字面量,挂在 pnpm verify 上。
//
// ── 与类型系统的分工(两者不重叠,加了新文案该指望哪一道由此确定)──
//   **漏译**由 typecheck 拦:源语言(zh)是唯一真相,其余五语在类型上与它逐条对齐,
//   少一条即 TS2739、多一条即 TS2353。它管的是"字典内部齐不齐"。
//   **漏抽**由本门禁拦:文案还写在组件/主进程里、根本没进字典,类型系统看不见它——
//   对 TS 来说那只是个普通字符串。它管的是"该进字典的都进去了没有"。
//
// ── 扫描口径 ──
// 只看**会流向界面的**中文:字符串字面量与 JSX 文本。注释不算(它们是写给开发者的,
// 强行英文化只会让本地维护变难,ADR-0016 的中性条款已定此口径)。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const CJK = /[\u4e00-\u9fff]/

/**
 * 白名单。**每一条都要能回答"去掉它门禁会红吗"——不会红的条目是多余的,删掉。**
 * 白名单不得为了让门禁变绿而放宽:那等于把门禁关掉还留着一个绿灯。
 */
const ALLOW = [
  {
    // 去掉会红:六份字典**就是**中文文案的家,扫它等于扫源语言本身
    match: (rel) => rel.startsWith('shared/i18n/'),
    why: '六语字典本体——源语言(zh)的文案必然是中文,这里正是它该待的地方'
  },
  {
    // 去掉会红:测试里有中文断言、fixture 与用例名,它们不流向界面
    match: (rel) => rel.endsWith('.test.ts') || rel.endsWith('.test.tsx'),
    why: '测试文件:用例名、fixture 与断言中的中文不进产品界面'
  }
]

/** 剥掉注释与字符串外的内容,只留可能流向界面的字面量与 JSX 文本 */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // 行注释(避开 http:// 这类)
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(p)) out.push(p)
  }
  return out
}

const hits = []
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split('\\').join('/')
  const lines = strip(readFileSync(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    if (!CJK.test(line)) return
    if (ALLOW.some((a) => a.match(rel, line))) return
    hits.push({ rel, n: i + 1, text: line.trim().slice(0, 100) })
  })
}

if (hits.length) {
  console.error(`✗ 文案门禁:发现 ${hits.length} 处未进字典的中文字面量\n`)
  for (const h of hits) console.error(`    src/${h.rel}:${h.n}  ${h.text}`)
  console.error(
    '\n把它们移进 src/shared/i18n/zh.ts 并补齐其余五语(漏补由 typecheck 拦)。\n' +
      '确属开发者日志或测试用途的,在 scripts/check-i18n.mjs 的白名单里显式登记并写明理由。'
  )
  process.exit(1)
}
console.log('✓ 文案门禁:源码中无未进字典的中文字面量')
for (const a of ALLOW) console.log(`    白名单 · ${a.why}`)
