import assert from 'assert';
import {getProjectedContentText} from '../app/modules/group/contentProjectionHelpers.js';

describe('content projection helpers', () => {
	it('reuses cached text bodies by storage id', async () => {
		const storageReads = [];
		const storage = {
			async getFileDataText(storageId: string) {
				storageReads.push(storageId);
				return `body:${storageId}:${storageReads.length}`;
			}
		};
		const bodyTextCache = new Map<string, string>();

		const first = await getProjectedContentText(storage, {storageId: 'same-storage'} as any, {bodyTextCache});
		const second = await getProjectedContentText(storage, {storageId: 'same-storage'} as any, {bodyTextCache});
		const third = await getProjectedContentText(storage, {storageId: 'other-storage'} as any, {bodyTextCache});

		assert.equal(first, 'body:same-storage:1');
		assert.equal(second, first);
		assert.equal(third, 'body:other-storage:2');
		assert.deepEqual(storageReads, ['same-storage', 'other-storage']);
	});

	it('keeps uncached reads explicit when no cache is provided', async () => {
		let storageReads = 0;
		const storage = {
			async getFileDataText(storageId: string) {
				storageReads += 1;
				return `${storageId}:${storageReads}`;
			}
		};

		const first = await getProjectedContentText(storage, {storageId: 'text-storage'} as any);
		const second = await getProjectedContentText(storage, {storageId: 'text-storage'} as any);

		assert.equal(first, 'text-storage:1');
		assert.equal(second, 'text-storage:2');
		assert.equal(storageReads, 2);
	});

	it('evicts oldest cached text when a cache limit is set', async () => {
		const storageReads = [];
		const storage = {
			async getFileDataText(storageId: string) {
				storageReads.push(storageId);
				return `${storageId}:${storageReads.length}`;
			}
		};
		const bodyTextCache = new Map<string, string>();

		await getProjectedContentText(storage, {storageId: 'first'} as any, {
			bodyTextCache,
			bodyTextCacheMaxEntries: 2
		});
		await getProjectedContentText(storage, {storageId: 'second'} as any, {
			bodyTextCache,
			bodyTextCacheMaxEntries: 2
		});
		await getProjectedContentText(storage, {storageId: 'third'} as any, {
			bodyTextCache,
			bodyTextCacheMaxEntries: 2
		});
		const rereadFirst = await getProjectedContentText(storage, {storageId: 'first'} as any, {
			bodyTextCache,
			bodyTextCacheMaxEntries: 2
		});

		assert.equal(rereadFirst, 'first:4');
		assert.deepEqual(storageReads, ['first', 'second', 'third', 'first']);
		assert.deepEqual([...bodyTextCache.keys()], ['third', 'first']);
	});
});
