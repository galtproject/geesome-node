
/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import path from 'path';
import fs from "fs";
import * as uuid from 'uuid';
const {v4: uuidv4} = uuid['default'];

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

async function writeStreamToRandomPath(inputStream, extension) {
	const path = `/tmp/` + uuidv4() + '-' + new Date().getTime() + '.' + extension;
	await new Promise((resolve, reject) =>
		inputStream
			.on('error', error => {
				if (inputStream.truncated)
					// delete the truncated file
					fs.unlinkSync(path);
				reject(error);
			})
			.pipe(fs.createWriteStream(path))
			.on('close', () => resolve({path}))
	);
	return  path;
}

export default {
	getDirSize,
	writeStreamToRandomPath,
}