import * as sass from 'sass';
import { createApp } from './public/index.js';
import { renderToString } from 'vue/server-renderer';
import helpers from './helpers.js';
import * as fs from 'fs';
const {getFileContent, getFilePath} = helpers;

export default {
    // VueSSR: call prepareRender one time
    async prepareRender(store) {
        // const store = {path: url.split('?')[0], urlQuery, ...additionalData};
        loadAssets(store);
        const [{app, router}, {css}] = await Promise.all([
            createApp(store),// VueSSR: init simple Vue app with components, pages and routes
            sass['default'].compileAsync(getFilePath('styles/index.scss'))
        ]);
        const rootContent = getFileContent('index.html');
        return {
            css,
            // VueSSR: call for each page and save to fs
            renderPage: (url, headers) => {
                return renderApp(app, router, rootContent, url, headers, 'en');
            }
        };
    },
};

async function renderApp(app, router, rootContent, url, headers, lang) {
    // console.log('app', app);
    const slashSplit = url.split('/');
    const relativeRoot = slashSplit.length > 2 ? slashSplit.slice(1).map(() => '../').join('') : './';
    await router.push(url);
    // app.use(Notifications);
    // installFakeComponent(app, '$notify', 'Notifications');

    // VueSSR: generated html string of page
    const content = await renderToString(app);

    const title = headers.filter(h => h[1].name === 'og:title')[0][1].content;

    // VueSSR: replace index.html variable with result values
    return rootContent
        .replace('{{relativeRoot}}', relativeRoot)
        .replace('{{lang}}', lang)
        .replace('{{headers}}', `<title>${title}</title>\n` + headers.map(([tag, attr]) => `<${tag} name="${attr['name']}" content="${attr['content']}"/>`).join('\n'))
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