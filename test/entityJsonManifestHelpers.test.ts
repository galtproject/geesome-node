import assert from 'assert';
import {
	applyGroupManifestGenerationCursor,
	applyPostIndexPageRefChanges,
	buildGroupManifestPostIndexPageChanges,
	defaultGroupManifestInlinePostsLimit,
	getInlineGroupManifestPostRefs,
	getManifestStorageIdForPostRef,
	getPostCursorFromValues,
	getSortedTouchedPostIndexPageKeys,
	groupManifestPostIndexType,
	isPostCursorAfter,
	normalizeGroupManifestPostRefs,
	normalizeGroupManifestRemovedLocalIds,
	setGroupManifestPostIndex,
	shouldIncludeInlineGroupManifestPosts,
	unsetTreeNode,
	updateGenerationStateCursor
} from '../app/modules/entityJsonManifest/helpers.js';

describe('entityJsonManifest helpers', () => {
	it('normalizes and deduplicates group manifest post refs', () => {
		const refs = normalizeGroupManifestPostRefs([
			{localId: '3', manifestStorageId: {'/': 'cid-3-old'}},
			{localId: 1, manifestStorageId: 'cid-1'},
			{localId: 'bad', manifestStorageId: 'cid-bad'},
			{localId: 0, manifestStorageId: 'cid-zero'},
			{localId: 3, manifestStorageId: {'/': 'cid-3-new'}},
			{localId: 2, manifestStorageId: null}
		]);

		assert.deepEqual(refs, [
			{localId: 1, manifestStorageId: 'cid-1'},
			{localId: 3, manifestStorageId: 'cid-3-new'}
		]);
		assert.deepEqual(normalizeGroupManifestRemovedLocalIds([3, '1', 3, 0, null, 'bad', 2]), [1, 2, 3]);
	});

	it('keeps encrypted post manifest refs separate from public refs', () => {
		assert.equal(getManifestStorageIdForPostRef({
			localId: 1,
			manifestStorageId: 'public-cid',
			encryptedManifestStorageId: 'encrypted-cid',
			isEncrypted: true
		} as any), 'encrypted-cid');
		assert.equal(getManifestStorageIdForPostRef({
			localId: 1,
			manifestStorageId: {'/': 'public-cid'},
			encryptedManifestStorageId: 'encrypted-cid',
			isEncrypted: false
		} as any), 'public-cid');
		assert.equal(getManifestStorageIdForPostRef({
			localId: 0,
			manifestStorageId: 'public-cid'
		} as any), null);
	});

	it('groups changed and removed post refs by index page', () => {
		const pageChanges = buildGroupManifestPostIndexPageChanges(
			2,
			[
				{localId: 1, manifestStorageId: 'cid-1'},
				{localId: 3, manifestStorageId: 'cid-3'},
				{localId: 4, manifestStorageId: 'cid-4'}
			],
			[2, 5]
		);

		assert.deepEqual(getSortedTouchedPostIndexPageKeys(pageChanges), ['0', '1', '2']);
		assert.deepEqual(pageChanges.changedRefsByPage.get('0'), [
			{localId: 1, manifestStorageId: 'cid-1'}
		]);
		assert.deepEqual(pageChanges.changedRefsByPage.get('1'), [
			{localId: 3, manifestStorageId: 'cid-3'},
			{localId: 4, manifestStorageId: 'cid-4'}
		]);
		assert.deepEqual(pageChanges.removedIdsByPage.get('0'), [2]);
		assert.deepEqual(pageChanges.removedIdsByPage.get('2'), [5]);
	});

	it('applies post index page removals before upserts', () => {
		const refs = applyPostIndexPageRefChanges(
			[
				{localId: 1, manifestStorageId: 'cid-1'},
				{localId: 2, manifestStorageId: 'cid-2-old'},
				{localId: 4, manifestStorageId: 'cid-4'}
			],
			[
				{localId: 2, manifestStorageId: 'cid-2-new'},
				{localId: 3, manifestStorageId: 'cid-3'}
			],
			[1, 2, 4]
		);

		assert.deepEqual(refs, [
			{localId: 2, manifestStorageId: 'cid-2-new'},
			{localId: 3, manifestStorageId: 'cid-3'}
		]);
	});

	it('sets sorted post index metadata and preserves explicit counts', () => {
		const groupManifest: any = {};
		const pages = {
			'10': {storageId: 'page-10', count: 1},
			'2': {storageId: 'page-2', count: 2},
			'1': {storageId: 'page-1', count: 3}
		};

		setGroupManifestPostIndex(groupManifest, {} as any, 50, pages);

		assert.equal(groupManifest.postsIndex.indexType, groupManifestPostIndexType);
		assert.equal(groupManifest.postsIndex.pageSize, 50);
		assert.equal(groupManifest.postsIndex.postCount, 6);
		assert.equal(groupManifest.postsIndex.pageCount, 3);
		assert.deepEqual(Object.keys(groupManifest.postsIndex.pages), ['1', '2', '10']);

		setGroupManifestPostIndex(groupManifest, {} as any, 50, pages, 12);

		assert.equal(groupManifest.postsIndex.postCount, 12);
	});

	it('uses inline post limits unless caller forces a mode', () => {
		assert.equal(shouldIncludeInlineGroupManifestPosts({availablePostsCount: defaultGroupManifestInlinePostsLimit} as any), true);
		assert.equal(shouldIncludeInlineGroupManifestPosts({availablePostsCount: defaultGroupManifestInlinePostsLimit + 1} as any), false);
		assert.equal(shouldIncludeInlineGroupManifestPosts({availablePostsCount: 2} as any, {inlinePostsLimit: 2}), true);
		assert.equal(shouldIncludeInlineGroupManifestPosts({availablePostsCount: 3} as any, {inlinePostsLimit: 2}), false);
		assert.equal(shouldIncludeInlineGroupManifestPosts({availablePostsCount: 3000} as any, {includeInlinePosts: true}), true);
		assert.equal(shouldIncludeInlineGroupManifestPosts({availablePostsCount: 1} as any, {includeInlinePosts: false}), false);
		assert.equal(shouldIncludeInlineGroupManifestPosts({availablePostsCount: 'unknown'} as any, {inlinePostsLimit: 0}), true);
	});

	it('normalizes manifest cursors and applies generation filters', () => {
		const filters = [{}, {}];
		const cursor = applyGroupManifestGenerationCursor({
			manifestPostsCursorUpdatedAt: '2026-05-15T12:00:00.000Z',
			manifestPostsCursorId: '42'
		} as any, {updatedAt: '2026-05-14T12:00:00.000Z'}, filters);

		assert.equal(cursor.id, 42);
		assert.equal(cursor.updatedAt.getTime(), new Date('2026-05-15T12:00:00.000Z').getTime());
		assert.equal((filters[0] as any).updatedAtGte.getTime(), cursor.updatedAt.getTime());
		assert.equal((filters[1] as any).updatedAtGte.getTime(), cursor.updatedAt.getTime());

		const fallbackFilters = [{}];
		const fallbackCursor = applyGroupManifestGenerationCursor({} as any, {updatedAt: 1700000000}, fallbackFilters);

		assert.equal(fallbackCursor, null);
		assert.equal((fallbackFilters[0] as any).updatedAtGte.getTime(), 1700000000 * 1000);
	});

	it('advances generation state cursors by updatedAt and then id', () => {
		const current = getPostCursorFromValues('2026-05-15T12:00:00.000Z', 10);
		const sameTimeOlderId = getPostCursorFromValues('2026-05-15T12:00:00.000Z', 9);
		const sameTimeNewerId = getPostCursorFromValues('2026-05-15T12:00:00.000Z', 11);

		assert.equal(isPostCursorAfter(sameTimeOlderId, current), false);
		assert.equal(isPostCursorAfter(sameTimeNewerId, current), true);

		const options: any = {generationState: {postCursor: current}};
		updateGenerationStateCursor(options, {
			id: 9,
			updatedAt: '2026-05-15T12:00:00.000Z'
		});

		assert.equal(options.generationState.postCursor.id, 10);

		updateGenerationStateCursor(options, {
			id: 11,
			updatedAt: '2026-05-15T12:00:00.000Z'
		});

		assert.equal(options.generationState.postCursor.id, 11);
	});

	it('reads inline group manifest post refs and unsets tree nodes', () => {
		const postsTree = {
			'2': {'/': 'cid-2'},
			'1': 'cid-1',
			'0': 'cid-zero',
			bad: 'cid-bad'
		};

		assert.deepEqual(getInlineGroupManifestPostRefs(postsTree), [
			{localId: 1, manifestStorageId: 'cid-1'},
			{localId: 2, manifestStorageId: 'cid-2'}
		]);

		unsetTreeNode(postsTree, 1);

		assert.deepEqual(getInlineGroupManifestPostRefs(postsTree), [
			{localId: 2, manifestStorageId: 'cid-2'}
		]);
	});
});
