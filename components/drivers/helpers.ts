
/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
export {};

const path = require('path');
const fs = require('fs');

function getAllFiles(dirPath, arrayOfFiles?) {
	let files = fs.readdirSync(dirPath);

	arrayOfFiles = arrayOfFiles || [];

	files.forEach(function (file) {
		if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
			arrayOfFiles = getAllFiles(path.join(dirPath, file), arrayOfFiles)
		} else {
			arrayOfFiles.push(path.join(dirPath, file))
		}
	});

	return arrayOfFiles
}

function getDirSize(directoryPath) {
	const arrayOfFiles = getAllFiles(directoryPath);

	let totalSize = 0;

	arrayOfFiles.forEach(function (filePath) {
		totalSize += fs.statSync(filePath).size
	});

	return totalSize
}

module.exports = {
	getDirSize
}