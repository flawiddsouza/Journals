import { resolve } from 'path'
import { defineConfig, type Plugin, type UserConfig } from 'vite'
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
                    rename: 'vue.esm-browser.prod.js',
                },
                {
                    src: 'node_modules/@excalidraw/excalidraw/dist/prod/fonts',
                    dest: 'excalidraw',
                },
            ],
        }),
    ],
    publicDir: 'public-assets',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                page: resolve(__dirname, 'page/index.html'),
            },
        },
        outDir: 'public',
    },
} satisfies UserConfig & { test: TestUserConfig }

export default defineConfig(config)
