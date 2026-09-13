import { createContext, useContext } from 'react'
import type { StartupStatus } from '@shared/display-data'
import { useDict } from './language'
import { RefreshCw } from './icons'
export const StartupContext = createContext<StartupStatus>('scanning')
/** Uses the existing title-row scanning treatment confirmed in the original prototypes. */
export function StartupHint(): JSX.Element {
  const status = useContext(StartupContext)
  const t = useDict()
  const label = status === 'waiting' ? t.shell.waitingUpdate : t.shell.scanning
  return <span className="scan-hint startup-display-hint" data-state={status} title={label} role="status">
    <RefreshCw size={12} /><span>{label}</span>
  </span>
}
