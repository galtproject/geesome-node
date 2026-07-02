import assert from 'node:assert';
import {
	generateActivityPubRsaKeyPair,
	signActivityPubRequestWithKey,
	verifyActivityPubRequestWithKey
} from '../app/modules/activityPub/signatureHelpers.js';

describe('activityPub signature helpers', () => {
	it('verifies inbound HTTP signatures with digest and date checks', () => {
		const actorKey = getRemoteActorKey();
		const body = JSON.stringify({type: 'Follow', actor: actorKey.actorUrl});
		const date = new Date('2026-06-01T12:00:00Z');
		const signedRequest = signActivityPubRequestWithKey(actorKey, {
			method: 'POST',
			url: 'https://social.example/ap/shared-inbox?source=test',
			body,
			date
		});
		const verified = verifyActivityPubRequestWithKey({
			keyId: actorKey.keyId,
			actorUrl: actorKey.actorUrl,
			publicKeyPem: actorKey.publicKeyPem
		}, {
			method: 'POST',
			url: '/ap/shared-inbox?source=test',
			headers: signedRequest.headers,
			body: Buffer.from(body),
			now: date
		});

		assert.equal(verified.keyId, actorKey.keyId);
		assert.equal(verified.digestVerified, true);
		assert.deepEqual(verified.signedHeaders, ['(request-target)', 'host', 'date', 'digest']);
		assert.match(verified.signingString, /^\(request-target\): post \/ap\/shared-inbox\?source=test/);
		assert.throws(() => verifyActivityPubRequestWithKey({
			keyId: actorKey.keyId,
			publicKeyPem: actorKey.publicKeyPem
		}, {
			method: 'POST',
			url: '/ap/shared-inbox?source=test',
			headers: signedRequest.headers,
			body: Buffer.from(JSON.stringify({type: 'Undo'})),
			now: date
		}), /activitypub_digest_mismatch/);
		assert.throws(() => verifyActivityPubRequestWithKey({
			keyId: actorKey.keyId,
			publicKeyPem: actorKey.publicKeyPem
		}, {
			method: 'POST',
			url: '/ap/shared-inbox?source=test',
			headers: signedRequest.headers,
			body: Buffer.from(body),
			now: new Date('2026-06-02T02:00:01Z')
		}), /activitypub_signature_date_out_of_range/);
	});
});

function getRemoteActorKey() {
	const keyPair = generateActivityPubRsaKeyPair();

	return {
		keyId: 'https://remote.example/users/alice#main-key',
		actorUrl: 'https://remote.example/users/alice',
		publicKeyPem: keyPair.publicKeyPem,
		privateKeyPem: keyPair.privateKeyPem
	};
}
