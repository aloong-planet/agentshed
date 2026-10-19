// The macOS gate job's artifact, as the release workflow's later jobs download it (scripts/publish-release.mjs,
// scripts/mirror-release.mjs). upload-artifact roots it at release/, the part of its paths before the first
// wildcard, so a download holds one directory named for the version, with the DMGs and the notary logs in it.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The DMGs the artifact downloaded to `dir` holds for `tag` (`v<version>`), sorted by name, or an error when the
 * artifact is not exactly that version's: another entry at its root, no DMG, or a DMG named for another version.
 */
export function releaseFiles(dir, tag) {
  const version = tag.slice(1)
  const entries = readdirSync(dir)
  if (entries.length !== 1 || entries[0] !== version || !statSync(join(dir, version)).isDirectory()) {
    throw new Error(`the artifact holds ${entries.join(', ') || 'nothing'}, not one ${version} directory`)
  }
  const versionDir = join(dir, version)
  const names = readdirSync(versionDir).filter((name) => name.endsWith('.dmg')).sort()
  if (names.length === 0) throw new Error(`no DMG in ${versionDir}`)
  const foreign = names.filter((name) => !name.includes(`-${version}-mac-`))
  if (foreign.length > 0) throw new Error(`${foreign.join(', ')} is not a DMG of version ${version}`)
  return { version, names, files: names.map((name) => join(versionDir, name)) }
}
