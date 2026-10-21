import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
import {buildArchive} from '../app/modules/archive/buildArchive.js';
import {normalizeStorageId} from '../app/modules/archive/index.js';

const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGiRA1QbSTAWtH7YLyGDnS1';

describe('archive validation and bounded streaming', () => {
	it('normalizes CID aliases and rejects paths, mutable names and malformed CIDs', () => {
		assert.equal(normalizeStorageId(normalizeStorageId(cid)), normalizeStorageId(cid));
		for (const input of ['QmBad', cid + '/index.html', '/ipfs/' + cid, '', null]) {
			assert.throws(() => normalizeStorageId(input), error => error['status'] === 400);
		}
	});

	for (const name of ['..', '.', '../escape', '/absolute', 'back\\slash', 'null\0byte']) {
		it(`rejects unsafe entry ${JSON.stringify(name)}`, async () => {
			await withOutput(async output => {
				await assert.rejects(() => buildArchive({
					getFileStat: async () => ({type: 'directory'}),
					nodeLs: async () => [{name}],
				} as any, cid, output, async () => {}, new AbortController().signal), /archive_unsafe_path/);
			});
		});
	}

	it('rejects oversized files before opening the source stream', async () => {
		await withOutput(async output => {
			await assert.rejects(() => buildArchive({
				getFileStat: async () => ({type: 'file', size: 1024 ** 3 + 1}),
				getFileStream: async () => { throw new Error('source_must_not_open'); },
			} as any, cid, output, async () => {}, new AbortController().signal), /archive_size_limit/);
		});
	});

	it('propagates source stream failure instead of producing a successful archive', async () => {
		await withOutput(async output => {
			await assert.rejects(() => buildArchive({
				getFileStat: async () => ({type: 'file', size: 5}),
				getFileStream: async () => Readable.from((async function* () { throw new Error('source_failed'); })()),
			} as any, cid, output, async () => {}, new AbortController().signal), /source_failed/);
		});
	});

	it('honors operation cancellation before reading data', async () => {
		await withOutput(async output => {
			await assert.rejects(() => buildArchive({} as any, cid, output, async () => { throw new Error('operation_canceled'); }, new AbortController().signal), /operation_canceled/);
		});
	});
});

async function withOutput(run) {
	const directory = await mkdtemp(path.join(tmpdir(), 'archive-test-'));
	try {
		await run(path.join(directory, 'archive.tar.gz'));
	} finally {
		await rm(directory, {recursive: true, force: true});
	}
}
