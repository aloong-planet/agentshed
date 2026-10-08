// plugins-view sequence H: the row list in a plugin expansion's Skills tab —
// each row is name + description + package stats, clicking a row expands the file table, and clicking a
// file opens a drawer; readability is independent of enablement (ADR-0012).
// An unreadable row (missing package root / null stats) is greyed out and unclickable (H6, failing
// before the click); a native disabled attribute shows no
// title, so a class name is used to grey it out while keeping the tooltip.
import { useEffect, useState } from 'react'
import type { PluginSkillSummary } from '@shared/domain'
import type { ListSkillFilesArgs, SkillFileEntry } from '@shared/ipc'
import { SkillFileDrawer } from './SkillFileDrawer'
import { SkillFilesTable, formatSize } from './SkillFilesTable'
import { toast } from './Toast'
import { errorText } from '@shared/error-text'
import { useLanguage, useDict } from './language'
import { ChevronRight, Dot } from './icons'
import { SIDE_SHORT_NAME } from './side-badge'
import { useSkillFilesQuery } from './skill-files-query'

export function PluginSkillList({
  ns,
  side,
  root,
  skills
}: {
  /** The namespace prefix (the plugin name before the @) */
  ns: string
  side: 'claude' | 'codex'
  /** The summary-source package root; null = the install directory is missing (the whole table is greyed out) */
  root: string | null
  skills: PluginSkillSummary[]
}): JSX.Element {
  const t = useDict()
  const lang = useLanguage()
  const [openName, setOpenName] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<{ f: SkillFileEntry; skill: string } | null>(null)

  // Not expanded yet → the query is disabled (fetch on first expand); re-expanding a previously
  // opened row hits the cache instead of always refetching, unlike the pre-query-layer code.
  const args: ListSkillFilesArgs | null =
    openName === null ? null : { side, name: openName, scope: 'plugin', pluginRoot: root! }
  const { data: listResult, isLoading: loading } = useSkillFilesQuery(args)
  const listing = listResult?.ok ? listResult.listing : null
  // The same sentence as the toast below, in the current UI language (skills-view A11)
  const err = listResult?.ok === false ? t.skills.listFailed(errorText(lang, listResult.error)) : null

  useEffect(() => {
    if (listResult?.ok === false) toast('err', t.skills.listFailed(errorText(lang, listResult.error)))
    // `lang` and `t` are left out on purpose: the toast belongs to a failed result, so switching the UI
    // language must not show it a second time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listResult])

  function toggle(name: string): void {
    setOpenName((prev) => (prev === name ? null : name))
  }

  return (
    <div className="psk-list">
      {skills.map((s) => {
        const readable = root !== null && s.pkg !== null
        const on = openName === s.name
        const reason = root === null ? t.skills.installMissing : t.skills.pkgUnreadable
        return (
          <div key={s.name}>
            <button
              type="button"
              className={`psk ${on ? 'on' : ''} ${readable ? '' : 'dis'}`}
              title={readable ? undefined : reason}
              onClick={() => {
                if (readable) toggle(s.name)
              }}
            >
              <span className="cv">{readable ? <ChevronRight size={11} /> : <Dot size={11} />}</span>
              <span className="nm mono">
                {ns}:{s.name}
              </span>
              <span className="ds">{s.description ?? ''}</span>
              <span className="meta">
                {s.pkg ? t.skills.pkgSummary(s.pkg.files, formatSize(lang, s.pkg.bytes)) : reason}
              </span>
            </button>
            {on && (
              <div className="psk-body">
                <SkillFilesTable
                  listing={listing}
                  loading={loading}
                  error={err}
                  onOpen={(f) => setDrawer({ f, skill: `${ns}:${s.name}` })}
                />
              </div>
            )}
          </div>
        )
      })}
      {drawer && (
        <SkillFileDrawer
          skill={drawer.skill}
          sideLabel={SIDE_SHORT_NAME[side]}
          levelLabel={t.skills.srcPluginPkg}
          filePath={drawer.f.path}
          absPath={drawer.f.absPath}
          files={listing?.files ?? []}
          onOpenFile={(f) => setDrawer({ f, skill: drawer.skill })}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}
