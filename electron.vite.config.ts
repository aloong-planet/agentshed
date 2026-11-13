import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { engineBuildDefine } from './scripts/lib/engine-build.mjs'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    // The build the engine module must report (ADR-0045): the main process and both workers refuse another
    define: engineBuildDefine(),
    build: {
      rollupOptions: {
        // The two workers are entries of their own, started as worker threads from out/main: the main process
        // starts the scan worker (ADR-0043), and the scan worker's ParsePool starts the parse workers
        input: {
          index: resolve('src/main/index.ts'),
          'scan-worker': resolve('src/main/scan-worker.ts'),
          'parse-worker': resolve('src/main/parse-worker.ts')
        }
      }
    }
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        // The preload uses CJS (Electron requires .cjs under sandbox and contextIsolation)
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    resolve: { alias: { '@shared': shared } },
    plugins: [react()]
  }
})
