import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createGzip} from 'node:zlib';
import tar from 'tar-stream';
import type IGeesomeStorageModule from '../storage/interface.js';

const maxArchiveBytes = 1024 * 1024 * 1024;
const maxArchiveEntries = 10000;
const maxArchiveDepth = 64;

export async function buildArchive(storage: IGeesomeStorageModule, storageId: string, outputPath: string, checkpoint: () => Promise<void>, signal: AbortSignal) {
	const pack = tar.pack();
	const output = pipeline(pack, createGzip(), fs.createWriteStream(outputPath), {signal});
	let entries = 0;
	let bytes = 0;
	const walk = async (source: string, name: string, depth: number) => {
		await checkpoint();
		signal.throwIfAborted();
		if (++entries > maxArchiveEntries || depth > maxArchiveDepth) {
			throw new Error('archive_entry_limit');
		}
		const stat = await storage.getFileStat(source, {signal, attempts: 0});
		if (stat.type === 'directory') {
			await new Promise<void>((resolve, reject) => pack.entry({name: name + '/', type: 'directory', mode: 0o755, mtime: new Date(0)}, error => error ? reject(error) : resolve()));
			const children = await storage.nodeLs(source);
			// Kubo emits a self entry without a name when ls targets an empty directory.
			if (children.length === 1 && !children[0].name && children[0].path === source) {
				return;
			}
			const names = new Set<string>();
			for (const child of children) {
				if (!child.name || child.name === '.' || child.name === '..' || /[/\\\x00-\x1f]/.test(child.name)) {
					throw new Error('archive_unsafe_path');
				}
				if (names.has(child.name)) {
					throw new Error('archive_duplicate_path');
				}
				names.add(child.name);
				await walk(source + '/' + child.name, name + '/' + child.name, depth + 1);
			}
			return;
		}
		if (stat.type !== 'file' && stat.type !== 'raw') {
			throw new Error('archive_unsupported_type');
		}
		const size = Number(stat.size);
		bytes += size;
		if (!Number.isSafeInteger(size) || size < 0 || bytes > maxArchiveBytes) {
			throw new Error('archive_size_limit');
		}
		const entry = pack.entry({name, size, mode: 0o644, mtime: new Date(0)});
		const stream = await storage.getFileStream(source, {signal});
		await pipeline(stream, entry, {signal});
	};
	const produce = async () => {
		try {
			await walk(storageId, storageId, 0);
			pack.finalize();
		} catch (error) {
			pack.destroy(error);
			throw error;
		}
	};
	await Promise.all([output, produce()]);
	return {entries, bytes};
}
