import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const webUiRoot = new URL('../Web-UI/', import.meta.url).pathname
const webUiSrc = new URL('../Web-UI/src/', import.meta.url).pathname

export default defineConfig({
  plugins: [svelte({
    onwarn: (warning, handler) => {
      // Suppress a11y warnings during tests
      if (warning.code.startsWith('a11y_')) return;
      // Suppress node_invalid_placement_ssr warning
      if (warning.code === 'node_invalid_placement_ssr') return;
      handler(warning);
    }
  })],
  resolve: {
    alias: {
      '@web-ui': webUiRoot,
      '@web-ui-src': webUiSrc,
    },
  },
  test: {
    setupFiles: ['./setup.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      // https://vitest.dev/guide/browser/playwright
      instances: [
        {
          browser: 'chromium',
        },
      ],
    },
  },
})
