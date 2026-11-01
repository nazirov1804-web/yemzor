import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const buildId = new Date().toISOString()
const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(buildId),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'yemzor-version-manifest',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: appVersion, buildId }),
        })
      },
    },
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
