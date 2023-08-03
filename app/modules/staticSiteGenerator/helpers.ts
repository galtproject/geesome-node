/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const {
    readdirSync,
    rmdirSync,
    unlinkSync,
    statSync,
} = require('fs');
const { join } = require('path');
// const fetch = require('node-fetch');

const includes = require('lodash/includes');
const trim = require('lodash/trim');
const cheerio = require('cheerio');

const isDir = path => {
    try {
        return statSync(path).isDirectory();
    } catch (error) {
        return false;
    }
};

const getFiles = (path) =>
    readdirSync(path)
        .map(name => join(path, name))
        // .filter(filePath => !isDir(filePath));

const getDirectories = path =>
    readdirSync(path)
        .map(name => join(path, name))
        .filter(isDir);

const rmDir = path => {
    try {
        getDirectories(path).map(dir => rmDir(dir));
    } catch (e) {
        if (includes(e.message, 'ENOENT')) {
            return;
        } else {
            throw e;
        }
    }
    getFiles(path).map(file => unlinkSync(file));
    rmdirSync(path);
};


function getMainMediaContent(contents) {
    return contents.filter((t) => t.view === 'contents' && (t.type === 'image' || t.type === 'video'))[0];
}

function removeHtml(text) {
    return text.replace(/<[^>]*>?/gm, '');
}
function fillTextWithSplitArr(text, splitArr, targetTextLength) {
    if (text.length >= targetTextLength || !splitArr.length) {
        return {result: text, arrFinished: true};
    }
    let result = text;
    let lastIndex = 0;
    splitArr.some(({t, s}, i) => {
        if (!t) {
            lastIndex = i + 1;
            return;
        }
        let tempResult = result + (result ? s : '') + t;
        if (removeHtml(tempResult).length <= targetTextLength) {
            lastIndex = i + 1;
            result = tempResult;
        } else {
            return true;
        }
    });
    return {result, lastIndex, arrFinished: lastIndex === splitArr.length - 1};
}
function splitBySeparatorsAndFill(text, output, maxOutputLength, firstSeparator = ' ') {
    let restText = text;
    let splitArr = [];
    let lastMatch = firstSeparator;
    do {
        const match = /[\!\?\.] /.exec(restText);
        if (!match) {
            splitArr.push({
                t: restText,
                s: lastMatch
            });
            break;
        }
        splitArr.push({
            t: restText.slice(0, match.index),
            s: lastMatch
        });
        lastMatch = match[0];
        if (restText === restText.slice(match.index)) {
            splitArr.push({
                t: restText,
                s: lastMatch
            });
            break;
        }
        restText = restText.slice(match.index);
    } while(true);
    let {result, lastIndex} = fillTextWithSplitArr(output, splitArr, maxOutputLength);
    return {result, restArr: splitArr.slice(lastIndex)}
}
function getTitleAndDescription(texts, postSettings, plainText = false) {
    let contents = texts.filter((t) => t.view === 'contents');
    console.log('getTitleAndDescription contents', contents);
    if (!contents[0]) {
        contents = [texts[0]];
    }
    if (!contents[0]) {
        return {title: "", description: ""};
    }
    const {titleLength, descriptionLength} = postSettings;

    let text = contents.map(c => c.text).join('<br><br>');
    let splitText = text.split('<br>');
    if (plainText) {
        splitText = splitText.map(t => removeHtml(t));
    }
    let description = '';
    let title = '';

    let lastSplitTextIndex = 0;
    if (titleLength) {
        splitText.some((text, index) => {
            lastSplitTextIndex = index + 1;
            const {result, restArr} = splitBySeparatorsAndFill(text, title, titleLength);
            title = result;

            if (restArr.length) {
                let {result} = fillTextWithSplitArr(description, restArr, descriptionLength);
                description = result;
                return true;
            }
        });
    }
    if (lastSplitTextIndex >= splitText.length || !descriptionLength) {
        return {title: removeHtml(title), description: fixHtml(description)};
    }
    splitText.slice(lastSplitTextIndex).some((text) => {
        const {result, restArr} = splitBySeparatorsAndFill(text, description, descriptionLength, '<br>');
        description = result;

        if (restArr.length) {
            description += '...';
            return true;
        }
    });
    return {title: removeHtml(title), description: fixHtml(description)};
}

function getPostTitleAndDescription(post, contents, postSettings) {
    const texts = contents.filter(c => c.type === 'text');
    console.log('texts', texts);
    const {title: itemTitle, description: itemDescription} = getTitleAndDescription(texts, postSettings);

    let pageTitle = itemTitle;
    if (!pageTitle) {
        const result = getTitleAndDescription(texts, {titleLength: 100});
        pageTitle = result.title;
    }
    pageTitle = removeHtml(pageTitle);
    return { itemTitle, itemDescription, pageTitle, pageDescription: removeHtml(itemDescription) };
}

function getOgHeaders(siteName, lang, title, description, imageUrl) {
    const localesByLang = {
        'ru': 'ru_RU',
        'en': 'en_US'
    }
    let headers = [
        ['meta', { name: 'og:site_name', content: siteName }],
        ['meta', { name: 'og:type', content: 'website' }],
        // ['meta', { name: 'og:url', content: siteUrl }],
        ['meta', { name: 'og:title', content: title }],
        ['meta', { name: 'og:locale', content: localesByLang[lang] }],
        ['meta', { name: 'twitter:site', content: siteName }],
        ['meta', { name: 'twitter:title', content: title }],
        // ['meta', { name: 'twitter:url', content: siteUrl }],
    ];

    if (description) {
        headers = headers.concat([
            ['meta', { name: 'description', content: description }],
            ['meta', { name: 'og:description', content: description }],
            ['meta', { name: 'twitter:description', content: description }],
        ]);
    }

    if (imageUrl) {
        headers = headers.concat([
            ['meta', { name: 'og:image', content: imageUrl }],
            ['meta', { name: 'twitter:image', content: imageUrl }],
            ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ]);
    }
    return headers;
}

function fixHtml(html) {
    html = trim(html, " ").replace(/<\/?br\/?>/g, '<br/>').replace(/^(<\/?br\/?>)+|(<\/?br\/?>)+$/g, '');
    html = cheerio.load(html, { xmlMode: true, decodeEntities: false }).html();
    return trim(html, " ");
}

// async function apiRequest(port, method, token, body) {
//     return fetch(`http://localhost:${port}/v1/${method}`, {
//         "headers": {
//             "accept": "application/json, text/plain, */*",
//             "authorization": "Bearer " + token,
//             "content-type": "application/json",
//         },
//         "body": JSON.stringify(body),
//         "method": "POST"
//     }).then(r => r.json());
// }

module.exports = { rmDir, getTitleAndDescription, getPostTitleAndDescription, getMainMediaContent, getOgHeaders, removeHtml };