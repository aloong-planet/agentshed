import type { AgentshedApi } from '../../preload/index'

declare global {
  interface Window {
    agentshed: AgentshedApi
  }
}

export {}
