// Reading Grok-side data: the registry (the trusted-folder ledger, ADR-0019).
// The registry is the per-project record Grok keeps on a user decision — the folders table in
// trusted_folders.toml — never the session store's directory names (which decode losslessly and are
// therefore tempting, but would make "registered" mean something different on this side).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { RegistryResult } from './claude'
import { ERR } from '@shared/errors'

export function readGrokRegistry(grokHome: string): RegistryResult {
  if (!existsSync(grokHome)) return { detected: false, paths: [] }
  const ledger = join(grokHome, 'trusted_folders.toml')
  // A9: an installed side that has registered nothing is a normal state, not a failure
  if (!existsSync(ledger)) return { detected: true, paths: [] }
  try {
    const parsed = parseToml(readFileSync(ledger, 'utf8')) as Record<string, unknown>
    const folders = parsed['folders']
    if (typeof folders !== 'object' || folders === null) return { detected: true, paths: [] }
    return { detected: true, paths: Object.keys(folders) }
  } catch (err) {
    return {
      detected: true,
      paths: [],
      error: { code: ERR.registryParseFailed, params: { detail: String(err) } }
    }
  }
}
