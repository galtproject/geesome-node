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
const fetch = require('node-fetch');

const includes = require('lodash/includes');
const trimStart = require('lodash/trimStart');
const trim = require('lodash/trim');
const find = require('lodash/find');
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

function getTitleAndDescription(texts, postSettings) {
    let contents = texts.filter((t) => t.view === 'contents');
    if (!contents[0]) {
        contents = [texts[0]];
    }
    if (!contents[0]) {
        return {title: "", description: ""};
    }
    let text = contents.map(c => c.text).join('<br><br>');
    const {titleLength, descriptionLength} = postSettings;
    let title = text;
    let description = '';
    let dotsAdded = false;
    if (title.length > titleLength) {
        title = title.slice(0, titleLength) + '...';
        dotsAdded = true;
        description = '...' + title.slice(titleLength, titleLength + descriptionLength);
    } else if (text.split('\n')[1]) {
        description = trimStart(text.split('\n')[1], '#').slice(descriptionLength);
        if (description.length + title.length < text.length) {
            description += '...';
        }
    }
    if (text.length > title.length && !dotsAdded) {
        title += '...';
    }
    title = fixHtml(title);
    description = fixHtml(description);
    return {title, description};
}

function fixHtml(html) {
    html = trim(html, " ").replace(/<\/?br\/?>/g, '<br/>').replace(/^(<\/?br\/?>)+|(<\/?br\/?>)+$/g, '');
    html = cheerio.load(html, { xmlMode: true, decodeEntities: false }).html();
    return trim(html, " ");
}

async function apiRequest(port, method, token, body) {
    return fetch(`http://localhost:${port}/v1/${method}`, {
        "headers": {
            "accept": "application/json, text/plain, */*",
            "authorization": "Bearer " + token,
            "content-type": "application/json",
        },
        "body": JSON.stringify(body),
        "method": "POST"
    }).then(r => r.json());
}

module.exports = { rmDir, getTitleAndDescription, apiRequest };