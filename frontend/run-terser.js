
/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const Terser = require("terser");
const fs = require("fs");
const buildPath = `${__dirname}/dist/build/`;
const pIteration = require("p-iteration");

let totalSize = 0;
pIteration.forEachSeries(['ipfs', 'vue', 'lodash', 'async', 'bluebird', 'axios', 'moment', 'ethers', 'indexeddbshim', 'nedb', 'web3', 'node-forge', 'openpgp', 'galtproject', 'app'], async (fileName) => {
	const filePath = `${buildPath}${fileName}.js`;
	console.log('filePath', filePath);
	if(!fs.existsSync(filePath)) {
	  return;
  	}
	let jsContent = fs.readFileSync(filePath).toString();
	if(!jsContent) {
	  return;
  	}
	jsContent = await Terser.minify(jsContent, { ecma: 7 });

	console.log('jsContent', Object.keys(jsContent));

	jsContent.code = jsContent.code.replace(/["']use strict["'];?/g, '');
	let code = jsContent.code.replace(/this\.crypto/g, 'window.crypto');

	try {
		code = require("babel-core").transform(jsContent.code, {
			"presets": [ "es2015", "stage-0" ],
			plugins: [
				"transform-object-rest-spread",
				// ["transform-es2015-modules-commonjs", { "strict": false, "allowTopLevelThis": true }]
			],
			sourceType: 'script',
			compact: true
		}).code;
	} catch (e) {}

	fs.writeFileSync(filePath, code);
	const contentSize = Buffer.from(code).length / 1024 ** 2;
	totalSize += contentSize;

	console.log(`${new Date().toISOString().slice(0, 16)} ✅ Minified ${fileName}: ${Math.round(contentSize * 10 ** 3) / 10 ** 3} Mb\n`);
}).then(() => {
	console.log(`Total frontend build size: ${Math.round(totalSize * 10 ** 3) / 10 ** 3} Mb`);
}).catch((e) => {
  console.error('error', e);
});

