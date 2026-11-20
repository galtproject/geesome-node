import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {importClientRelease, ReleaseImportError} from '../app/modules/clientReleases/import.js';

export async function main() {
	const {values} = parseArgs({options: {source: {type: 'string'}, node: {type: 'string'}, help: {type: 'boolean'}}});
	if (values.help) {
		console.log('Usage: npm run client:releases:import -- --source https://source.example --node https://your-node.example\nSet GEESOME_RELEASE_API_KEY to your node administrator API key. The official publisher key is bundled; no signing key or PEM setup is required. The destination retrieves and verifies the original CID through IPFS.');
		return;
	}
	if (!values.source || !values.node) {
		throw new ReleaseImportError('Provide --source https://source.example and --node https://your-node.example.');
	}
	const result = await importClientRelease({source: values.source, node: values.node,
		apiKey: process.env.GEESOME_RELEASE_API_KEY,
		trust: {enabled: process.env.GEESOME_CLIENT_RELEASES !== '0', publicKey: process.env.GEESOME_CLIENT_RELEASE_PUBLIC_KEY || ''}});
	console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch(error => {
		// Avoid logging request objects/credentials even if a transport error includes them.
		console.error(error instanceof ReleaseImportError ? error.message
			: 'Client release import failed. Check the node addresses, administrator key, trusted publisher and IPFS source availability. No publisher private key is needed.');
		process.exitCode = 1;
	});
}
