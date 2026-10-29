import {sitePresentationCss} from './presentation.js';
import {loadCreatorApp} from './creatorRenderer.js';
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
        const {css} = await compileStyles(Boolean(storageData.membership), storageData.creator?.resource?.presentation);
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
    const {app} = await createApp(storageData, url, storageData.membership ? await loadCreatorApp() : null);
    const slashSplit = url.split('/');
    const relativeRoot = storageData.relativeRoot ?? (slashSplit.length > 2 ? slashSplit.slice(1).map(() => '../').join('') : './');
    // app.use(Notifications);
    // installFakeComponent(app, '$notify', 'Notifications');

    // VueSSR: generated html string of page
    const content = await renderToString(app);

    const title = getHeaderContent(headers, 'og:title');

    // VueSSR: replace index.html variable with result values
    const replacements = {
        relativeRoot, lang, content, bodyClass: storageData.membership ? 'creator-page' : '',
        favicon: storageData.favicon === false ? '<link rel="icon" href="data:,"/>'
            : `<link rel="shortcut icon" href="${escapeHtmlAttribute(relativeRoot)}favicon.ico"/>`,
        headers: `<title>${escapeHtml(title)}</title>\n` + headers.map(([tag, attr]) => getHeaderTagHtml(tag, attr)).join('\n'),
        clientData: JSON.stringify({...storageData, path: url}).replace(/</g, '\\u003c'),
    };
    return rootContent.replace(/\{\{(relativeRoot|lang|headers|content|clientData|favicon|bodyClass)}}/g, (_token, key) => replacements[key]);
}

function getHeaderContent(headers, name) {
    const header = headers.find(h => h[1].name === name);
    if (!header) {
        return '';
    }
    return header[1].content || '';
}

function getHeaderTagHtml(tag, attr) {
    return `<${tag} ${Object.entries(attr).map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`).join(' ')}/>`;
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

function compileStyles(creator = false, presentation) {
    if (creator) {
        return {css: getFileContent('public/creator/style.css') + '\n' + sitePresentationCss(presentation)};
    }
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
