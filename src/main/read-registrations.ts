import type { ReadRegistrations, RegistrationScope } from '@shared/display-data'

/** Each scan/detail/package enumeration owns its exact paths. Replacing one owner cannot either
 * retain that owner's obsolete permission or revoke another owner's current permission. */
export class ReadRegistry {
  private scopes = new Map<string, { scope: RegistrationScope; restored: boolean }>()
  constructor(scopes: RegistrationScope[] = []) {
    for (const scope of scopes) this.scopes.set(scope.owner, { scope, restored: true })
  }
  admission(kind: keyof ReadRegistrations, path: string): 'restored' | 'live' | null {
    let restored = false
    for (const entry of this.scopes.values()) if (entry.scope[kind].includes(path)) {
      if (!entry.restored) return 'live'
      restored = true
    }
    return restored ? 'restored' : null
  }
  replace(scope: RegistrationScope): void { this.scopes.set(scope.owner, { scope, restored: false }) }
  remove(owner: string): void { this.scopes.delete(owner) }
  snapshot(): RegistrationScope[] { return [...this.scopes.values()].map(e => e.scope) }
}
