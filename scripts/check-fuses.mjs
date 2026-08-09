#!/usr/bin/env node
// 校验打包产物里的 Electron Fuses 实际状态(官方 Security Checklist #19)。
// 为什么直接读二进制:electron-builder 的 electronFuses 配置写对了不代表生效
// (版本差异、平台差异、配置段位置错都会静默跳过),只有读产物才是事实。
// 用法:node scripts/check-fuses.mjs <path-to-.app>   (未传则找 release/ 下最新)
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// @electron/fuses 在二进制里用这个哨兵串标记 fuse wire 起点
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'utf8')
const NAMES = [
  'runAsNode',
  'cookieEncryption',
  'nodeOptions',
  'nodeCliInspect',
  'asarIntegrity',
  'onlyLoadAppFromAsar',
  'v8Snapshot',
  'fileProtocolPrivileges',
  'wasmTrapHandlers' // Electron 41 追加(index 8);fuses 只追加不重排,故按下标读长期安全
]
/** 期望值:与 electron-builder.yml 的 electronFuses 段一致,两处不符即报错 */
const EXPECT = {
  runAsNode: 'DISABLED',
  nodeOptions: 'DISABLED',
  nodeCliInspect: 'DISABLED',
  onlyLoadAppFromAsar: 'ENABLED',
  cookieEncryption: 'ENABLED',
  asarIntegrity: 'ENABLED',
  fileProtocolPrivileges: 'DISABLED' // 无 file:// 页面加载,特权是纯余量
}

function findApp() {
  const rel = 'release'
  if (!existsSync(rel)) return null
  for (const v of readdirSync(rel).sort().reverse()) {
    for (const d of ['mac-arm64', 'mac', 'mac-x64']) {
      const dir = join(rel, v, d)
      if (!existsSync(dir)) continue
      const app = readdirSync(dir).find((n) => n.endsWith('.app'))
      if (app) return join(dir, app)
    }
  }
  return null
}

const appPath = process.argv[2] ?? findApp()
if (!appPath) {
  console.error('No .app bundle found; run `pnpm build && npx electron-builder --dir` first')
  process.exit(2)
}
const bin = join(appPath, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework')
if (!existsSync(bin)) {
  console.error(`Electron Framework not found: ${bin}`)
  process.exit(2)
}

const buf = readFileSync(bin)
const i = buf.indexOf(SENTINEL)
if (i < 0) {
  console.error('No fuse wire found in the binary — the fuses were never written')
  process.exit(1)
}
const start = i + SENTINEL.length
const count = buf[start + 1]
const actual = {}
for (let k = 0; k < count; k++) {
  const v = buf[start + 2 + k]
  actual[NAMES[k] ?? `fuse${k}`] = v === 0x31 ? 'ENABLED' : v === 0x30 ? 'DISABLED' : 'REMOVED'
}

let bad = 0
for (const [name, want] of Object.entries(EXPECT)) {
  const got = actual[name]
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? '✓' : '✗'} ${name} = ${got}${ok ? '' : ` (expected ${want})`}`)
}
if (bad) {
  console.error(`\n${bad} fuse(s) do not match electronFuses in electron-builder.yml`)
  process.exit(1)
}
console.log('\nFuses check passed')
