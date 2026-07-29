import assert from 'node:assert';
import {pinRemoteChatAttachments} from '../app/modules/chat/attachmentStorage.js';

describe('chat attachment storage', () => {
	it('awaits every remote ciphertext pin before returning', async () => {
		const pinned = [];
		const storage: any = {
			addPin: async storageId => {
				pinned.push(storageId);
			}
		};

		await pinRemoteChatAttachments(storage, ['first-cid', 'second-cid']);

		assert.deepEqual(pinned, ['first-cid', 'second-cid']);
	});

	it('returns a retryable service error when a ciphertext cannot be pinned', async () => {
		const storage: any = {
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
			addPin: async () => new Promise(() => {})
		};
		const startedAt = Date.now();

		await assert.rejects(
			() => pinRemoteChatAttachments(storage, ['stalled-cid'], {timeoutMs: 5}),
			/chat_attachment_fetch_failed/
		);

		assert.ok(Date.now() - startedAt < 1000);
	});
});
