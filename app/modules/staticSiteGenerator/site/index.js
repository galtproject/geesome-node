import * as sass from 'sass';
import { createApp } from './public/index.js';
import { renderToString } from 'vue/server-renderer';
import helpers from './helpers.js';
import * as fs from 'fs';
const {getFileContent, getFilePath} = helpers;

export default {
    // VueSSR: call prepareRender one time
    async prepareRender(storageData) {
        // const storageData = {path: url.split('?')[0], urlQuery, ...additionalData};
        loadAssets(storageData);
        const {css} = await compileStyles();
        const rootContent = getFileContent('index.html');
        return {
            css,
            // VueSSR: call for each page and save to fs
            renderPage: (url, headers) => {
                return renderApp(storageData, rootContent, url, headers, 'en');
            }
        };
    },
};

async function renderApp(storageData, rootContent, url, headers, lang) {
    // console.log('app', app);
    const {app} = await createApp(storageData, url);
    const slashSplit = url.split('/');
    const relativeRoot = slashSplit.length > 2 ? slashSplit.slice(1).map(() => '../').join('') : './';
    // app.use(Notifications);
    // installFakeComponent(app, '$notify', 'Notifications');

    // VueSSR: generated html string of page
    const content = await renderToString(app);

    const title = getHeaderContent(headers, 'og:title');

    // VueSSR: replace index.html variable with result values
    return rootContent
        .replace(/\{\{relativeRoot}}/g, relativeRoot)
        .replace('{{lang}}', lang)
        .replace('{{headers}}', `<title>${escapeHtml(title)}</title>\n` + headers.map(([tag, attr]) => getHeaderTagHtml(tag, attr)).join('\n'))
        .replace('{{content}}', content);
}

function getHeaderContent(headers, name) {
    const header = headers.find(h => h[1].name === name);
    if (!header) {
        return '';
    }
    return header[1].content || '';
}

function getHeaderTagHtml(tag, attr) {
    return `<${tag} name="${escapeHtmlAttribute(attr['name'])}" content="${escapeHtmlAttribute(attr['content'])}"/>`;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value) {
    return escapeHtml(value)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function compileStyles() {
    return sass.compileAsync(getFilePath('styles/index.scss'));
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
