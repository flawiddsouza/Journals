import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
    // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
    // for more information about preprocessors
    preprocess: vitePreprocess(),
    onwarn: (warning, handler) => {
        // suppress warnings on `vite dev` and `vite build`; but even without this, things still work
        if (warning.code === 'a11y-click-events-have-key-events') return
        if (warning.code === 'a11y-no-static-element-interactions') return
        if (warning.code === 'a11y-no-noninteractive-element-interactions')
            return
        if (warning.code === 'a11y-no-noninteractive-tabindex') return
        if (warning.code === 'a11y-autofocus') return
        if (warning.code === 'a11y-mouse-events-have-key-events') return
        handler(warning)
    },
}
