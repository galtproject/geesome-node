import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import tar from 'tar-stream';

export async function readArchive(buffer: Buffer): Promise<Map<string, Buffer | null>> {
	const entries = new Map<string, Buffer | null>();
	const extract = tar.extract();
	extract.on('entry', (header, stream, next) => {
		const chunks = [];
		stream.on('data', chunk => chunks.push(chunk));
		stream.on('end', () => {
			assert.equal(entries.has(header.name), false);
			entries.set(header.name, header.type === 'directory' ? null : Buffer.concat(chunks));
			next();
		});
		stream.on('error', next);
	});
	await pipeline(Readable.from(buffer), createGunzip(), extract);
	return entries;
}

export async function assertArchiveMatchesStorage(storage, storageId: string, archive: Map<string, Buffer | null>) {
	let count = 0;
	const walk = async (source, name) => {
		count++;
		const stat = await storage.getFileStat(source);
		if (stat.type === 'directory') {
			assert.equal(archive.get(name + '/'), null, name);
			const children = await storage.nodeLs(source);
			for (const child of children) {
				if (children.length === 1 && !child.name && child.path === source) {
					continue;
				}
				await walk(source + '/' + child.name, name + '/' + child.name);
			}
			return;
		}
		assert.deepEqual(archive.get(name), Buffer.from((await storage.getFileData(source)).slice()), name);
	};
	await walk(storageId, storageId);
	assert.equal(archive.size, count, 'archive has exactly the source entries');
	return count;
}
