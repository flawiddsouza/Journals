import { resolve } from 'path'
import { defaultClientConditions, defineConfig, type Plugin, type UserConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import type { TestUserConfig } from 'vitest/config'

const pagePathRewriteMiddleware: Plugin = {
    name: 'rewrite-middleware',
    configureServer(serve) {
        serve.middlewares.use((req, res, next) => {
            if (req.url?.startsWith('/page/')) {
                req.url = '/page/'
            }
            next()
        })
    },
}

// https://vitejs.dev/config/
const config = {
    test: {
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,mjs,ts}'],
    },
    plugins: [
        pagePathRewriteMiddleware,
        svelte(),
        // Copy whitelisted ESM libraries from node_modules into a stable URL under /libs
        viteStaticCopy({
            targets: [
                {
                    src: 'node_modules/vue/dist/vue.esm-browser.prod.js',
                    dest: 'libs/vue@3.x',
                    rename: { stripBase: true },
                },
                {
                    src: 'node_modules/@excalidraw/excalidraw/dist/prod/fonts',
                    dest: 'excalidraw',
                    // Drops node_modules/@excalidraw/excalidraw/dist/prod, keeping fonts/.
                    rename: { stripBase: 5 },
                },
            ],
        }),
    ],
    resolve: {
        // vite-plugin-svelte 3 sets conditions: ['svelte'], which Vite 6+ uses in
        // place of its defaults instead of beside them. Without 'browser', svelte
        // resolves to its server build, whose onMount never runs.
        conditions: [...defaultClientConditions],
    },
    css: {
        // x-data-spreadsheet's styles divide outside parentheses (width: 100% / 7),
        // which less 4 leaves as invalid CSS unless math is evaluated everywhere.
        preprocessorOptions: { less: { math: 'always' } },
    },
    publicDir: 'public-assets',
    server: {
        // The MCP sidecar is served from the app's own address when deployed
        // (nginx.conf), and "Connect AI Apps" builds its addresses on that.
        proxy: Object.fromEntries(
            ['/mcp', '/oauth', '/.well-known/oauth-'].map((path) => [path, 'http://localhost:9901']),
        ),
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'index.html'),
                page: resolve(import.meta.dirname, 'page/index.html'),
            },
        },
        outDir: 'public',
    },
} satisfies UserConfig & { test: TestUserConfig }

export default defineConfig(config)
