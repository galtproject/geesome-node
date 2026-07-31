import assert from 'node:assert';
import {ApiProblemError, getApiProblem, getRequestId} from '../app/modules/api/problem.js';
import {
	getApiKeyScopes,
	normalizeIntegrationScopes,
	requireIntegrationScopes,
	serializeApiKey
} from '../app/modules/api/integrationScopes.js';
import {
	getAssetRequestHash,
	validateBytes,
	validateLogicalPath,
	validateMimeType,
	validateSha256
} from '../app/modules/asset/index.js';
import {CorePermissionName} from '../app/modules/database/interface.js';
import {buildOpenApiFromApiDoc} from '../app/apiDocSpec.js';
import {getPublicApiContext} from '../app/modules/api/publicUrls.js';

describe('agent-friendly API contracts', function () {
	this.timeout(30_000);
	it('preserves valid request IDs and replaces invalid values', () => {
		assert.equal(getRequestId('consumer:release-1'), 'consumer:release-1');
		assert.match(getRequestId('invalid request id'), /^req_[0-9a-f-]+$/);
	});

	it('serializes stable problem details without internal error text', () => {
		const explicit = getApiProblem(new ApiProblemError(422, 'asset_digest_mismatch', 'Asset digest mismatch', 'Expected bytes did not match.'), 'req_test');
		assert.equal(explicit.status, 422);
		assert.equal(explicit.code, 'asset_digest_mismatch');
		assert.equal(explicit.requestId, 'req_test');

		const internal = getApiProblem(new Error('database_password_secret'), 'req_internal');
		assert.equal(internal.status, 500);
		assert.equal(internal.code, 'internal_error');
		assert.equal(internal.detail, 'The server could not complete the request.');
	});

	it('maps integration scopes to legacy permissions and redacts key secrets', () => {
		assert.deepEqual(normalizeIntegrationScopes(['operations:read', 'assets:write']), ['assets:write', 'operations:read']);
		const legacyKey: any = {permissions: JSON.stringify([CorePermissionName.UserSaveData])};
		assert(getApiKeyScopes(legacyKey).includes('assets:write'));
		requireIntegrationScopes(legacyKey, ['assets:write', 'operations:read']);
		assert.throws(
			() => requireIntegrationScopes({permissions: '[]'} as any, ['assets:write']),
			(error: ApiProblemError) => error.code === 'insufficient_scope' && error.status === 403
		);
		const serialized = serializeApiKey({
			id: 7,
			title: 'publisher',
			valueHash: 'secret-hash',
			scopes: JSON.stringify(['assets:write']),
			isDisabled: false
		});
		assert.equal(serialized.id, 7);
		assert.deepEqual(serialized.scopes, ['assets:write']);
		assert.equal((serialized as any).valueHash, undefined);
	});

	it('validates asset metadata and hashes a stable request contract', () => {
		const digest = 'a'.repeat(64);
		assert.equal(validateSha256(digest.toUpperCase()), digest);
		assert.equal(validateBytes('42'), 42);
		assert.equal(validateMimeType('IMAGE/WEBP'), 'image/webp');
		assert.equal(validateLogicalPath('/games/character.webp'), 'games/character.webp');
		assert.throws(() => validateLogicalPath('../secret'), (error: ApiProblemError) => error.code === 'asset_logical_path_invalid');

		const first = getAssetRequestHash({sha256: digest, bytes: 42, mimeType: 'image/webp', logicalPath: 'character.webp'});
		const replay = getAssetRequestHash({sha256: digest, bytes: 42, mimeType: 'image/webp', logicalPath: 'character.webp'});
		const conflict = getAssetRequestHash({sha256: digest, bytes: 43, mimeType: 'image/webp', logicalPath: 'character.webp'});
		assert.equal(first, replay);
		assert.notEqual(first, conflict);
		assert.match(first, /^[a-f0-9]{64}$/);
	});

	it('publishes actionable OpenAPI upload requirements and responses', () => {
		const spec = buildOpenApiFromApiDoc('v1', undefined, 'https://geesome.example/api/v1');
		const create = spec.paths['/assets'].post;
		assert.equal(spec.servers[0].url, 'https://geesome.example/api/v1');
		assert.deepEqual(create['x-required-scopes'], ['assets:write']);
		assert.deepEqual(create.requestBody.content['multipart/form-data'].schema.required, ['file', 'expectedSha256']);
		assert(create.parameters.some(parameter => parameter.name === 'Idempotency-Key' && parameter.required));
		assert(create.responses['201']);
		assert(create.responses['401']);
		assert(create.responses['403']);
	});

	it('rejects unsafe public-origin configuration', () => {
		assert.throws(() => getPublicApiContext({config: {apiConfig: {publicUrl: 'javascript:alert(1)'}}} as any), /GEESOME_PUBLIC_URL/);
		assert.throws(() => getPublicApiContext({config: {apiConfig: {publicUrl: 'https://user:pass@example.com'}}} as any), /GEESOME_PUBLIC_URL/);
	});
});
