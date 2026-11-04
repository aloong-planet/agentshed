// What a launch does when the single-instance lock is refused (#367). The runtime answers no both for a second instance
// and for a settings directory where it cannot create the lock, read-only or on a full disk, and gives no way to tell them
// apart, so this tries the same write the lock makes: a symbolic link. Measured on a directory at mode 555 and on full APFS
// and HFS+ volumes, where it fails as the lock does.
//
// No Electron here, as in app-menu.ts: index.ts passes in the system's languages and shows what this returns.
import { symlinkSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { dictOf, effectiveLanguage } from '@shared/i18n'
import { PrefsStore } from './prefs-store'

export interface LaunchRefusal {
  title: string
  message: string
}

/**
 * The link's name carries the process id, as the store's temporary files do, and it is gone before this returns. A failed
 * link was never created, so that path has nothing to remove. The cause stays in the log, the one place it is any use.
 */
function canWriteIn(dir: string): boolean {
  const probe = join(dir, `.write-probe-${process.pid}`)
  try {
    symlinkSync('write-probe', probe)
    unlinkSync(probe)
    return true
  } catch (error) {
    console.error('[launch] the settings directory cannot be written:', error)
    return false
  }
}

/**
 * null for a launch to end silently, as a second instance does; otherwise the sentence to show before exiting non-zero.
 * A first instance may be running too, when the directory became unwritable after it started: the runtime has already told
 * it to take focus, and the sentence on top of it is still true of this launch.
 */
export function refusedLaunch(dir: string, systemLanguages: () => readonly string[]): LaunchRefusal | null {
  if (canWriteIn(dir)) return null
  // Only reads, and a file it cannot read leaves the language to the system
  const t = dictOf(effectiveLanguage(new PrefsStore(dir).get().language, systemLanguages())).launch
  return { title: t.cannotWriteTitle, message: t.cannotWriteMessage(dir) }
}
