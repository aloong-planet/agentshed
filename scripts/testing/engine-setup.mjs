// vitest's global setup (vitest.config.ts): builds the engine module the tests load (ADR-0045), the development build
// with the panic seam, once before any test file runs. cargo rebuilds only what changed, so a run on unchanged sources
// costs a check; a failed build fails the run before any test reports a module that will not load.
import { buildEngine } from '../build-engine.mjs'

export function setup() {
  buildEngine({ quiet: true })
}
