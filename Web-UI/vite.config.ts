import { resolve } from 'path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const pagePathRewriteMiddleware = {
    name: 'rewrite-middleware',
    configureServer(serve) {
        serve.middlewares.use((req, res, next) => {
            if (req.url.startsWith('/page/')) {
                req.url = '/page/'
            }
            next()
        })
    },
}

// https://vitejs.dev/config/
export default defineConfig({
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
})
