// electron-builder afterAllArtifactBuild 钩子:每次打包后只保留最近 N 个版本目录。
//
// 为什么需要:electron-builder 无内置"版本保留/清理旧产物"配置(实测 26.x schema 无 keep/retain/prune)。
// 若 `directories.output` 用 `release/${version}`,每次打包按版本建子目录,只写不删 → 版本无限累积、吃磁盘。
// 本脚本作为 afterAllArtifactBuild 钩子在打包末尾运行,自动把 output 根目录下的版本目录裁到最近 N 个。
//
// 接法(electron-builder.yml):
//   afterAllArtifactBuild: build/clean-old-releases.cjs
//   ⚠️ 若 package.json 是 "type": "module",文件名**必须 .cjs**(普通 .js 会被当 ESM,require 报错)。
//
// 也可脱离打包**手动运行**清理已有产物:
//   node build/clean-old-releases.cjs [releaseRoot]   # 省略 releaseRoot 则默认脚本上级的 release/
//
// 保留个数:默认 5,可用环境变量 KEEP_RELEASES 覆盖。
// 原则:只删严格 semver 版本目录、按 semver(非字符串)排序、删除失败只警告不拖垮打包(清理是附加动作)。
//
// 依赖假设:electron-builder 传入的 BuildResult 有 outDir(= 本次 output 目录,如 release/<version>),
// 其父目录即所有版本目录的根。脚本不硬编码任何路径,对任意 electron-builder 项目通用。

const { readdirSync, statSync, rmSync } = require('node:fs')
const { join, dirname, resolve } = require('node:path')

const KEEP = Number(process.env.KEEP_RELEASES) || 5

// 严格 semver:MAJOR.MINOR.PATCH(可带 -prerelease 后缀,如 1.2.0-beta)。非此形态的目录/散文件一律不碰。
const SEMVER_DIR = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

/** semver 比较:主.次.补 数值序(处理 0.10 vs 0.9);有 prerelease 排在同版正式版之前(1.0.0-rc < 1.0.0)。 */
function cmpSemver(a, b) {
  const pa = a.match(SEMVER_DIR)
  const pb = b.match(SEMVER_DIR)
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i])
    if (d !== 0) return d
  }
  const preA = a.includes('-')
  const preB = b.includes('-')
  if (preA !== preB) return preA ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** 清理 releaseRoot 下的旧版本目录,保留最新 keep 个。返回被删的目录名数组。 */
function cleanOldReleases(releaseRoot, keep = KEEP) {
  let entries
  try {
    entries = readdirSync(releaseRoot)
  } catch {
    return [] // 根不存在——静默跳过
  }
  // 只取"是目录 且 名字是严格 semver"的项;散文件(latest-mac.yml / *.blockmap 等)与非版本目录全部忽略
  const versionDirs = entries.filter((name) => {
    if (!SEMVER_DIR.test(name)) return false
    try {
      return statSync(join(releaseRoot, name)).isDirectory()
    } catch {
      return false
    }
  })
  if (versionDirs.length <= keep) return [] // 未超额,不删

  const sorted = versionDirs.sort(cmpSemver) // 升序:旧 → 新
  const toDelete = sorted.slice(0, sorted.length - keep) // 删掉除最新 keep 个之外的
  const deleted = []
  for (const name of toDelete) {
    try {
      rmSync(join(releaseRoot, name), { recursive: true, force: true })
      deleted.push(name)
    } catch (e) {
      // 删除失败(占用/权限)只警告,不抛 —— 清理不能拖垮打包
      console.warn(`[clean-old-releases] 删除 ${name} 失败(跳过):`, e && e.message)
    }
  }
  return deleted
}

/**
 * electron-builder 钩子入口(默认导出)。收 BuildResult,从 outDir 定位版本目录根。
 * 返回 [] —— 本钩子不追加产物,只做删除副作用(Hook<BuildResult, string[]>)。
 */
module.exports = function afterAllArtifactBuild(buildResult) {
  const releaseRoot = dirname(buildResult.outDir) // output=release/<version> → release
  const deleted = cleanOldReleases(releaseRoot, KEEP)
  if (deleted.length) {
    console.log(
      `[clean-old-releases] 保留最近 ${KEEP} 个版本,已删除 ${deleted.length} 个旧版本:${deleted.join(', ')}`
    )
  }
  return []
}

// 允许手动运行:`node clean-old-releases.cjs [releaseRoot]`
if (require.main === module) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '..', 'release')
  const deleted = cleanOldReleases(root, KEEP)
  console.log(
    deleted.length
      ? `保留最近 ${KEEP} 个,已删除 ${deleted.length} 个:${deleted.join(', ')}`
      : `无需清理(版本数 ≤ ${KEEP})`
  )
}
