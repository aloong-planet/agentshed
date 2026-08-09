// An electron-builder afterAllArtifactBuild hook: keep only the N most recent version directories after
// each packaging run.
//
// Why it is needed: electron-builder has no built-in "retain versions / clean old artifacts"
// configuration (measured: the 26.x schema has no keep/retain/prune).
// With `directories.output` set to `release/${version}`, each run creates a per-version subdirectory and
// only ever writes → versions accumulate without limit and eat disk.
// This script runs as an afterAllArtifactBuild hook at the end of packaging and trims the version
// directories under the output root to the most recent N.
//
// How to wire it up (electron-builder.yml):
//   afterAllArtifactBuild: build/clean-old-releases.cjs
//   ⚠️ If package.json is "type": "module", the filename **must be .cjs** (a plain .js would be treated as
//      ESM and require would fail).
//
// It can also be **run by hand**, outside packaging, to clean existing artifacts:
//   node build/clean-old-releases.cjs [releaseRoot]   # Omitting releaseRoot defaults to release/ one level
//                                                     # above the script
//
// How many to keep: 5 by default, overridable with the KEEP_RELEASES environment variable.
// Principles: only delete strict semver version directories, sort by semver (not as strings), and let a
// failed delete warn rather than drag down packaging (cleanup is an added extra).
//
// Assumption: the BuildResult electron-builder passes in has outDir (= this run's output directory, such
// as release/<version>),
// whose parent is the root of every version directory. The script hard-codes no path and works for any
// electron-builder project.

const { readdirSync, statSync, rmSync } = require('node:fs')
const { join, dirname, resolve } = require('node:path')

const KEEP = Number(process.env.KEEP_RELEASES) || 5

// Strict semver: MAJOR.MINOR.PATCH (optionally with a -prerelease suffix, such as 1.2.0-beta). Directories
// and loose files of any other shape are never touched.
const SEMVER_DIR = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

/** semver comparison: major.minor.patch in numeric order (handling 0.10 vs 0.9); a prerelease sorts before
 * the release of the same version (1.0.0-rc < 1.0.0). */
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

/** Clean old version directories under releaseRoot, keeping the newest `keep`. Returns the names deleted. */
function cleanOldReleases(releaseRoot, keep = KEEP) {
  let entries
  try {
    entries = readdirSync(releaseRoot)
  } catch {
    return [] // The root does not exist — skip silently
  }
  // Take only entries that are directories whose names are strict semver; loose files (latest-mac.yml,
  // *.blockmap and so on) and non-version directories are all ignored
  const versionDirs = entries.filter((name) => {
    if (!SEMVER_DIR.test(name)) return false
    try {
      return statSync(join(releaseRoot, name)).isDirectory()
    } catch {
      return false
    }
  })
  if (versionDirs.length <= keep) return [] // Not over the limit, nothing to delete

  const sorted = versionDirs.sort(cmpSemver) // Ascending: oldest → newest
  const toDelete = sorted.slice(0, sorted.length - keep) // Delete everything but the newest `keep`
  const deleted = []
  for (const name of toDelete) {
    try {
      rmSync(join(releaseRoot, name), { recursive: true, force: true })
      deleted.push(name)
    } catch (e) {
      // A failed delete (in use / permissions) only warns and never throws — cleanup must not drag down
      // packaging
      console.warn(`[clean-old-releases] failed to delete ${name} (skipped):`, e && e.message)
    }
  }
  return deleted
}

/**
 * The electron-builder hook entry point (the default export). Takes a BuildResult and locates the version
 * directory root from outDir.
 * Returns [] — this hook appends no artifact and only has the deletion side effect
 * (Hook<BuildResult, string[]>).
 */
module.exports = function afterAllArtifactBuild(buildResult) {
  const releaseRoot = dirname(buildResult.outDir) // output=release/<version> → release
  const deleted = cleanOldReleases(releaseRoot, KEEP)
  if (deleted.length) {
    console.log(
      `[clean-old-releases] keeping the ${KEEP} most recent versions; deleted ${deleted.length} old ${deleted.length === 1 ? 'version' : 'versions'}: ${deleted.join(', ')}`
    )
  }
  return []
}

// Allow manual runs: `node clean-old-releases.cjs [releaseRoot]`
if (require.main === module) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '..', 'release')
  const deleted = cleanOldReleases(root, KEEP)
  console.log(
    deleted.length
      ? `keeping the ${KEEP} most recent; deleted ${deleted.length}: ${deleted.join(', ')}`
      : `nothing to clean (version count ≤ ${KEEP})`
  )
}
