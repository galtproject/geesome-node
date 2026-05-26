import fs from 'fs';
import path from 'path';
import assert from 'assert';
import appHelpers from '../app/helpers.js';

const publicPath = path.join(appHelpers.getCurDir(), 'modules/staticSiteGenerator/site/public');
const quietClientFiles = [
	'client.js',
	'index.js',
	'pages/ContentList/index.js'
];

describe('staticSiteGenerator client bundle source', () => {
	it('keeps generated site visitor consoles quiet by default', () => {
		quietClientFiles.forEach((filePath) => {
			const content = fs.readFileSync(path.join(publicPath, filePath), 'utf8');
			assert.equal(content.includes('console.'), false, `${filePath} should not write to console`);
		});
	});
});
