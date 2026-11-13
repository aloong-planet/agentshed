// Types for engine-build.mjs, which the TypeScript configurations (electron.vite.config.ts, vitest.config.ts) import
export const REPO: string
export const ENGINE_DIR: string
export function engineBuild(): string
export function engineBuildDefine(): { __ENGINE_BUILD__: string }
