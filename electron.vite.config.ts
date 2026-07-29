import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } }
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        // preload 用 CJS(sandbox/contextIsolation 下 Electron 需要 .cjs)
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    resolve: { alias: { '@shared': shared } },
    plugins: [react()]
  }
})
