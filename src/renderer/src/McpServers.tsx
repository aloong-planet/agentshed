// The MCP section's server rows, and Antigravity CLI's group, which the agents page and a project's page both show
// (agents-overview::REQ-003/AC-04, project-detail::REQ-002/AC-03).
import type { McpServerEntry, Snapshot } from '@shared/domain'
import { useDict } from './language'
import { SIDE_BADGE, SIDE_CHIP_LABEL } from './side-badge'

/** One server: its name, where it is configured, a disabled pill when its own configuration says so, and the plugin
 * it comes from when a plugin bundles it */
export function McpServerRow({ m }: { m: McpServerEntry }): JSX.Element {
  const t = useDict()
  // The two file names are names, not copy
  const src = m.source === 'global-config' ? t.agents.srcGlobalConfig : m.source === 'plugin' ? t.agents.srcPlugin : m.source
  return (
    <div className="it">
      <span className="nm mono">{m.name}</span>
      <span className="src mono">{src}</span>
      {m.disabled && <span className="pill off">{t.detail.mcpDisabled}</span>}
      {m.plugin !== null && <span className="ds">{t.agents.mcpFromPlugin(m.plugin)}</span>}
    </div>
  )
}

/**
 * Antigravity CLI's servers: its global file's, then its effectively enabled plugins' under the name agy gives them.
 * agy's servers are global, so a project's page shows the same group, and only when it has servers; the agents page
 * shows it once agy is detected, saying so when it is empty. A project's own `.agents/mcp_config.json` is shown
 * nowhere: agy was not observed to load it (ADR-0037).
 */
export function AntigravityMcpGroup({ snap, onProjectPage }: { snap: Snapshot; onProjectPage?: boolean }): JSX.Element | null {
  const t = useDict()
  const servers = snap.global.mcp.filter((m) => m.side === 'antigravity')
  if (servers.length === 0 && (onProjectPage || !snap.sides.antigravity.detected)) return null
  return (
    <>
      <div className="grp-t" style={{ marginTop: 14 }}>
        <span className={`badge ${SIDE_BADGE.antigravity.cls}`}>{SIDE_CHIP_LABEL.antigravity}</span> ~/.gemini/config/mcp_config.json
      </div>
      {servers.length === 0 ? (
        <div className="none">{t.agents.noAgMcp}</div>
      ) : (
        <div className="card">
          {servers.map((m, i) => (
            <McpServerRow key={`${m.name}-${i}`} m={m} />
          ))}
        </div>
      )}
    </>
  )
}
