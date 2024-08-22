import { resolve } from 'path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const pagePathRewriteMiddleware = {
    name: 'rewrite-middleware',
    configureServer(serve) {
        serve.middlewares.use((req, res, next) => {
            if (req.url.startsWith('/page/')) {
                req.url = '/page/'
            }
            next()
        })
    }
  }

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        pagePathRewriteMiddleware,
        svelte()
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
