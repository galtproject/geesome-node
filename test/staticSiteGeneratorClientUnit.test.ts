import fs from 'fs';
import path from 'path';
import assert from 'assert';
import appHelpers from '../app/helpers.js';

const publicPath = path.join(appHelpers.getCurDir(), 'modules/staticSiteGenerator/site/public');
const diagnosticQuietFiles = [
	'index.js',
	'pages/ContentList/index.js'
];

describe('staticSiteGenerator client bundle source', () => {
	it('keeps incidental diagnostics out of generated site client code', () => {
		diagnosticQuietFiles.forEach((filePath) => {
			const content = fs.readFileSync(path.join(publicPath, filePath), 'utf8');
			assert.equal(content.includes('console.'), false, `${filePath} should not write diagnostic console output`);
		});
	});

	it('keeps the generated site developer banner available', () => {
		const content = fs.readFileSync(path.join(publicPath, 'client.js'), 'utf8');
		assert.equal(content.includes('Check out examples in https://github.com/galtproject/geesome-node'), true);
	});
});
