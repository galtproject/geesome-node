import {createHash, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const [origin, token, filePath] = process.argv.slice(2);
if (!origin || !token || !filePath) {
	console.error('Usage: node examples/agent-friendly-assets.mjs <origin> <token> <file>');
	process.exit(2);
}

const discovery = await getJson(`${origin.replace(/\/+$/, '')}/.well-known/geesome`);
const bytes = await readFile(filePath);
const expectedSha256 = createHash('sha256').update(bytes).digest('hex');
const form = new FormData();
form.append('file', new Blob([bytes]), path.basename(filePath));
form.append('expectedSha256', expectedSha256);
form.append('logicalPath', path.basename(filePath));

const response = await fetch(`${discovery.apiBaseUrl}/assets`, {
	method: 'POST',
	headers: {Authorization: `Bearer ${token}`, 'Idempotency-Key': `example:${randomUUID()}`},
	body: form
});
if (!response.ok) {
	throw new Error(`upload failed (${response.status}): ${await response.text()}`);
}
const asset = await response.json();
const head = await fetch(asset.urls.content, {method: 'HEAD'});
const expectedDigest = `sha-256=:${Buffer.from(expectedSha256, 'hex').toString('base64')}:`;
if (!head.ok || head.headers.get('content-digest') !== expectedDigest) {
	throw new Error('immutable read digest verification failed');
}
console.log(JSON.stringify({discovery: discovery.apiBaseUrl, asset, verified: true}, null, 2));

async function getJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`discovery failed (${response.status}): ${await response.text()}`);
	}
	return response.json();
}
