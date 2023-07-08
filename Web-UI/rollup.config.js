import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss'
import copy from 'rollup-plugin-copy'

const production = !process.env.ROLLUP_WATCH;

export default [
    { input: 'main', output: 'public' },
    { input: 'main2', output: 'public2' }
].map((bundle) => ({
    input: `src/${bundle.input}.js`,
    output: {
        sourcemap: true,
        format: 'iife',
        name: 'app',
        file: `${bundle.output}/bundle.js`
    },
    plugins: [
        postcss({
            plugins: []
        }),

        svelte({
            compilerOptions: {
                // enable run-time checks when not in production
                dev: !production
            },
            onwarn(warning, handler) {
                if(warning.code.startsWith('a11y-')) {
                    return
                }
                handler(warning)
            }
        }),

        // If you have external dependencies installed from
        // npm, you'll most likely need these plugins. In
        // some cases you'll need additional configuration —
        // consult the documentation for details:
        // https://github.com/rollup/rollup-plugin-commonjs
        resolve({
            browser: true,
            dedupe: importee => importee === 'svelte' || importee.startsWith('svelte/')
        }),
        commonjs(),

        // Watch the `public` / `public2` directory and refresh the
        // browser on changes when not in production
        !production && livereload(bundle.output),

        // If we're building for production (npm run build
        // instead of npm run dev), minify
        production && terser(),

        copy({
            targets: [
                { src: 'public-assets/**/*', dest: `${bundle.output}` }
            ]
        })
    ],
    watch: {
        clearScreen: false
    }
}));
