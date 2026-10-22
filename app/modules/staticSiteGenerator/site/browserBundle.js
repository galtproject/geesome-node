import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
let pending;

export function buildBrowserClient() {
    if (!pending) {
        pending = build({
            entryPoints: [fileURLToPath(new URL('./public/client.js', import.meta.url))],
            bundle: true,
            format: 'iife',
            platform: 'browser',
            target: 'es2019',
            minify: true,
            write: false,
            alias: {vue: require.resolve('vue/dist/vue.esm-bundler.js')},
            define: {
                'process.env.NODE_ENV': '"production"',
                __VUE_OPTIONS_API__: 'true',
                __VUE_PROD_DEVTOOLS__: 'false',
                __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
            },
        }).then(result => result.outputFiles[0].text).catch(error => {
            pending = null;
            throw error;
        });
    }
    return pending;
}
