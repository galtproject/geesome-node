import * as sass from 'sass';
import { createApp } from './public/index.js';
import { renderToString } from 'vue/server-renderer';
import helpers from './helpers.js';
import * as fs from 'fs';
const {getFileContent, getFilePath} = helpers;

export default {
    async prepareRender(data) {
        // const data = {path: url.split('?')[0], urlQuery, ...additionalData};
        loadAssets(data);
        const [{app, router}, {css}] = await Promise.all([
            createApp(data),
            sass['default'].compileAsync(getFilePath('styles/index.scss'))
        ]);
        const rootContent = getFileContent('index.html');
        return {
            css,
            renderPage: (url) => {
                return renderApp(app, router, rootContent, url, 'en');
            }
        };
    },
};

async function renderApp(app, router, rootContent, url, lang) {
    // console.log('app', app);
    const slashSplit = url.split('/');
    const relativeRoot = slashSplit.length > 2 ? slashSplit.slice(1).map(() => '../').join('') : './';
    await router.push(url);
    // app.use(Notifications);
    // installFakeComponent(app, '$notify', 'Notifications');
    const content = await renderToString(app);

    return rootContent
        .replace('{{relativeRoot}}', relativeRoot)
        .replace('{{lang}}', lang)
        // .replace('{{style}}', `<style>${css}</style>`)
        // .replace('{{clientDataName}}', 'page')
        // .replace('{{urlQuery}}', urlQuery || '')
        .replace('{{content}}', content);
}

function loadAssets(data) {
    data.assets = {};
    const curPath = import.meta.url.replace('file:///', '/');
    fs.readdirSync(curPath.replace('index.js', 'public/assets')).forEach(name => {
        data.assets['/assets/' + name] = fs.readFileSync(curPath.replace('index.js', 'public/assets/' + name), {encoding: 'utf8'});
    });
}

// function installFakeComponent(app, globalProp, globalComponent) {
//     app.use({
//         install() {
//             app.config.globalProperties[globalProp] = {};
//             app.component(globalComponent, {template: ''});
//         }
//     });
// }