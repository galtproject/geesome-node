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

const includes = require('lodash/includes');

const isDir = path => {
    try {
        console.log('isDir 1', path, statSync(path).isDirectory())
        return statSync(path).isDirectory();
    } catch (error) {
        console.log('isDir 2', path, false)
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
    console.log('path', path);
    getFiles(path).map(file => unlinkSync(file));
    rmdirSync(path);
};

module.exports = { rmDir };