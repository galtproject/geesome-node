import assert from 'node:assert';
import {
	assertOwnedChatAttachmentQuota,
	pinRemoteChatAttachments
} from '../app/modules/chat/attachmentStorage.js';

describe('chat attachment storage', () => {
	it('awaits every remote ciphertext pin before returning', async () => {
		const pinned = [];
		const storage: any = {
			getFileStat: async storageId => ({
				size: storageId === 'first-cid' ? 10 : 20
			}),
			addPin: async storageId => {
				pinned.push(storageId);
			}
		};

		await pinRemoteChatAttachments(storage, ['first-cid', 'second-cid']);

		assert.deepEqual(pinned, ['first-cid', 'second-cid']);
	});

	it('returns a retryable service error when a ciphertext cannot be pinned', async () => {
		const storage: any = {
			getFileStat: async () => ({size: 10}),
			addPin: async () => {
				throw new Error('ipfs object unavailable');
			}
		};

		await assert.rejects(
			() => pinRemoteChatAttachments(storage, ['missing-cid']),
			(error: any) => {
				assert.equal(error.message, 'chat_attachment_fetch_failed');
				assert.equal(error.code, 503);
				assert.equal(error.retryable, true);
				assert.equal(error.storageId, 'missing-cid');
				return true;
			}
		);
	});

	it('bounds the whole attachment batch below the delivery request timeout', async () => {
		const storage: any = {
			getFileStat: async () => new Promise(() => {}),
			addPin: async () => new Promise(() => {})
		};
		const startedAt = Date.now();

		await assert.rejects(
			() => pinRemoteChatAttachments(storage, ['stalled-cid'], {timeoutMs: 5}),
			/chat_attachment_fetch_failed/
		);

		assert.ok(Date.now() - startedAt < 1000);
	});

	it('rejects oversized remote ciphertext before pinning it', async () => {
		const pinned = [];
		const storage: any = {
			getFileStat: async () => ({size: 11}),
			addPin: async storageId => pinned.push(storageId)
		};

		await assert.rejects(
			() => pinRemoteChatAttachments(storage, ['large-cid'], {
				maxAttachmentBytes: 10,
				maxEventAttachmentBytes: 20
			}),
			(error: any) => {
				assert.equal(error.message, 'chat_attachment_too_large');
				assert.equal(error.code, 413);
				assert.equal(error.retryable, false);
				assert.equal(error.storageId, 'large-cid');
				return true;
			}
		);
		assert.deepEqual(pinned, []);
	});

	it('preflights the combined remote quota before pinning any ciphertext', async () => {
		const pinned = [];
		const storage: any = {
			getFileStat: async () => ({size: 7}),
			addPin: async storageId => pinned.push(storageId)
		};

		await assert.rejects(
			() => pinRemoteChatAttachments(storage, ['first-cid', 'second-cid'], {
				maxAttachmentBytes: 10,
				maxEventAttachmentBytes: 12
			}),
			/chat_attachment_quota_exceeded/
		);
		assert.deepEqual(pinned, []);
	});

	it('enforces the combined ciphertext quota for local attachments', () => {
		assert.throws(
			() => assertOwnedChatAttachmentQuota([
				{storageId: 'first-cid', size: '7'},
				{storageId: 'second-cid', size: 6}
			], {
				maxAttachmentBytes: 10,
				maxEventAttachmentBytes: 12
			}),
			(error: any) => {
				assert.equal(error.message, 'chat_attachment_quota_exceeded');
				assert.equal(error.storageId, 'second-cid');
				return true;
			}
		);
	});
});
