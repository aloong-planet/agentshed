#!/usr/bin/env node
// The release workflow's tag check (mac-distribution Failure A1): a tag push packages and publishes the version in
// package.json, so a tag naming any other version fails the run here, before anything is submitted to Apple.
//
//   GITHUB_REF_NAME=v0.2.0 node scripts/release-tag.mjs     run from the repository root
//
// It also refuses a version the workflow could misjudge: the workflow tells a pre-release by a `-` in the tag,
// which is semver's pre-release only for a semver version without build metadata (whose identifiers may hold a
// `-` of their own).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

/** The version a tag releases, or an error saying what is wrong with the pair */
export function checkReleaseTag(tag, packageVersion) {
  const parsed = semver.parse(packageVersion)
  if (parsed === null) throw new Error(`the package version ${packageVersion} is not a semver version`)
  if (parsed.build.length > 0) throw new Error(`the package version ${packageVersion} carries build metadata`)
  if (tag !== `v${packageVersion}`) {
    throw new Error(`the tag ${tag} does not match the package version ${packageVersion} (its tag is v${packageVersion})`)
  }
  return packageVersion
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const tag = process.env.GITHUB_REF_NAME
    if (!tag) throw new Error('GITHUB_REF_NAME is not set: run this on a tag push')
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
    console.log(`[release] tag ${tag} releases version ${checkReleaseTag(tag, version)}`)
  } catch (error) {
    console.error(`[release] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
