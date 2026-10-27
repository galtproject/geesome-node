import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse, compileScript, registerTS} from '@vue/compiler-sfc';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
registerTS(() => require('typescript'));

// Both targets compile the same render functions; Vue's server renderer consumes
// them too. No runtime template compilation or generated source files are needed.
export function vueComponents() {
    return {
        name: 'vue-components',
        setup(build) {
            build.onLoad({filter: /\.vue$/}, async ({path}) => {
                const source = await readFile(path, 'utf8');
                const {descriptor, errors} = parse(source, {filename: path});
                if (errors.length) {
                    throw errors[0];
                }
                if (descriptor.styles.length) {
                    throw new Error(`Keep creator styles in the shared stylesheet: ${path}`);
                }
                const script = compileScript(descriptor, {
                    fs: {fileExists: existsSync, readFile: file => readFileSync(file, 'utf8')},
                    id: createHash('sha256').update(path).digest('hex').slice(0, 12),
                    inlineTemplate: true,
                    templateOptions: {compilerOptions: {whitespace: 'condense'}},
                });
                return {contents: script.content, loader: 'ts'};
            });
        },
    };
}
