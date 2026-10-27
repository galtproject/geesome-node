import {build} from 'esbuild';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {vueComponents} from './vueCompiler.js';

const require = createRequire(import.meta.url);
const vueRuntime = new URL('./index.mjs', pathToFileURL(require.resolve('vue/package.json'))).href;
let pending;
export function loadCreatorApp() {
    if (!pending) {
        pending = build({
            entryPoints: [fileURLToPath(new URL('./public/creator/App.vue', import.meta.url))],
            bundle: true, platform: 'node', format: 'esm', target: 'es2020', write: false,
            plugins: [vueComponents(), {
                name: 'shared-vue-runtime',
                setup(build) {
                    // The in-memory module must share the server renderer's Vue
                    // instance, and data URLs cannot resolve bare package imports.
                    build.onResolve({filter: /^vue$/}, () => ({path: vueRuntime, external: true}));
                },
            }],
        }).then(async result => (await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))).default)
            .catch(error => {
                pending = null;
                throw error;
            });
    }
    return pending;
}
