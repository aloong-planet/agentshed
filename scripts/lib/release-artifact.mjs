// The macOS gate job's artifact, as the release workflow's later jobs download it (scripts/publish-release.mjs,
// scripts/mirror-release.mjs). upload-artifact roots it at release/, the part of its paths before the first
// wildcard, so a download holds one directory named for the version, with the DMGs, the files the in-app updater
// reads (the ZIPs, their blockmaps and the update metadata) and the notary logs in it.
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

/**
 * The files the in-app updater reads, which the GitHub release carries with the DMGs (mac-distribution::REQ-001/AC-02):
 * for each of `dmgs` (releaseFiles' names) the ZIP of the same name and its blockmap, and the one update metadata
 * file (`<channel>-mac.yml`). The gate job checked them against each other before the DMG went to Apple; this
 * refuses an artifact that does not hold them all, or holds a ZIP no DMG of this version has.
 */
export function updateFiles(dir, tag, dmgs) {
  const version = tag.slice(1)
  const versionDir = join(dir, version)
  const present = readdirSync(versionDir)
  const metadata = present.filter((name) => name.endsWith('-mac.yml')).sort()
  if (metadata.length === 0) throw new Error(`no update metadata (*-mac.yml) in ${versionDir}`)
  if (metadata.length > 1) throw new Error(`more than one update metadata file in ${versionDir}: ${metadata.join(', ')}`)
  const zips = dmgs.map((dmg) => `${dmg.slice(0, -'.dmg'.length)}.zip`)
  const expected = zips.flatMap((zip) => [zip, `${zip}.blockmap`])
  const stray = present.filter((name) => (name.endsWith('.zip') || name.endsWith('.zip.blockmap')) && !expected.includes(name))
  if (stray.length > 0) throw new Error(`${stray.join(', ')} has no DMG of version ${version} beside it`)
  dmgs.forEach((dmg, i) => {
    if (!present.includes(zips[i])) throw new Error(`no ZIP for ${dmg}: ${zips[i]}`)
    if (!present.includes(`${zips[i]}.blockmap`)) throw new Error(`no blockmap for ${zips[i]}`)
  })
  const names = [...expected, ...metadata]
  return { names, files: names.map((name) => join(versionDir, name)) }
}
