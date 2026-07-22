import assert from 'node:assert';
import {randomUUID} from 'node:crypto';
import {DataTypes, Op, Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import defineImageCompositionOperation, {
	ImageCompositionOperationState
} from '../app/modules/imageComposition/models/imageCompositionOperation.js';
import {
	canonicalizeImageCompositionRequest,
	createImageCompositionOperationRepository,
	createImageCompositionRequestHash
} from '../app/modules/imageComposition/operationRepository.js';

describe('image composition operation persistence', function () {
	this.timeout(30_000);

	let sequelize: Sequelize;
	let models;
	let repository;
	let targetPrefix: string;

	before(async () => {
		sequelize = new Sequelize({
			...(databaseConfig as any),
			pool: {max: 12, min: 0, acquire: 10_000, idle: 1_000},
			logging: false
		});
		models = {
			Content: sequelize.define('content', {
				name: DataTypes.STRING(200),
				isDeleted: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
			}),
		};
		await models.Content.sync({});
		models.FileCatalogItem = sequelize.define('fileCatalogItem', {name: DataTypes.STRING(200)});
		await models.FileCatalogItem.sync({});
		await defineImageCompositionOperation(sequelize, models);
		repository = createImageCompositionOperationRepository(sequelize, models);
	});

	beforeEach(() => {
		targetPrefix = `b2-${randomUUID()}`;
	});

	afterEach(async () => {
		await models.ImageCompositionOperation.destroy({
			where: {targetKey: {[Op.like]: `${targetPrefix}%`}}
		});
		await models.Content.destroy({where: {name: {[Op.like]: `${targetPrefix}%`}}});
	});

	after(async () => {
		await sequelize.close();
	});

	it('hashes equivalent request objects canonically while preserving array order', () => {
		const first = {stickers: [{id: 'a'}, {id: 'b'}], output: {height: 20, width: 10}};
		const reorderedKeys = {output: {width: 10, height: 20}, stickers: [{id: 'a'}, {id: 'b'}]};
		const reorderedArray = {output: {width: 10, height: 20}, stickers: [{id: 'b'}, {id: 'a'}]};

		assert.equal(canonicalizeImageCompositionRequest(first), canonicalizeImageCompositionRequest(reorderedKeys));
		assert.equal(createImageCompositionRequestHash(first), createImageCompositionRequestHash(reorderedKeys));
		assert.notEqual(createImageCompositionRequestHash(first), createImageCompositionRequestHash(reorderedArray));
		assert.match(createImageCompositionRequestHash(first), /^sha256:[a-f0-9]{64}$/);
		assert.throws(
			() => createImageCompositionRequestHash({width: Number.NaN}),
			(error: Error) => error.message === 'image_composition_request_not_json'
		);
	});

	it('allows exactly one concurrent claimant for the same database identity', async () => {
		const input = getClaimInput(`${targetPrefix}-concurrent`, {value: 'same'});
		const claims = await Promise.all(Array.from({length: 12}, () => repository.claim(input)));

		assert.equal(claims.filter((claim) => claim.disposition === 'claimed').length, 1);
		assert.equal(claims.filter((claim) => claim.disposition === 'pending').length, 11);
		assert.equal(new Set(claims.map((claim) => claim.operation.id)).size, 1);
		assert.equal(await models.ImageCompositionOperation.count({where: getIdentityWhere(input)}), 1);
	});

	it('rejects reuse of an identity with a different canonical request hash', async () => {
		const input = getClaimInput(`${targetPrefix}-mismatch`, {value: 'first'});
		await repository.claim(input);

		await assert.rejects(
			() => repository.claim({...input, requestHash: createImageCompositionRequestHash({value: 'second'})}),
			(error: Error & {code?: number}) => {
				assert.equal(error.message, 'composition_idempotency_conflict');
				assert.equal(error.code, 409);
				return true;
			}
		);
	});

	it('stores a successful result and replays it without claiming again', async () => {
		const input = getClaimInput(`${targetPrefix}-success`, {value: 'success'});
		const claim = await repository.claim(input);
		const content = await models.Content.create({name: `${targetPrefix}-result`});
		const catalogItem = await models.FileCatalogItem.create({name: `${targetPrefix}-item`});
		assert.equal(claim.disposition, 'claimed');

		await repository.succeed(claim.operation.id, claim.claimToken, {
			fileCatalogItemId: catalogItem.id,
			revision: 2,
			contentManifestId: 'composite-manifest',
			contentId: content.id,
			response: {compositionId: 'composition-1', revision: 2}
		});
		const replay = await repository.claim(input);

		assert.equal(replay.disposition, 'replay');
		assert.deepEqual(replay.result, {
			fileCatalogItemId: catalogItem.id,
			revision: 2,
			contentManifestId: 'composite-manifest',
			contentId: content.id,
			response: {compositionId: 'composition-1', revision: 2}
		});
		assert.equal(replay.operation.state, ImageCompositionOperationState.Succeeded);
		assert.equal(replay.operation.attemptCount, 1);
	});

	it('stores and replays a standalone content result without catalog identity', async () => {
		const input = getClaimInput(`${targetPrefix}-standalone-success`, {value: 'standalone'});
		const claim = await repository.claim(input);
		const content = await models.Content.create({name: `${targetPrefix}-standalone-result`});
		await repository.succeed(claim.operation.id, claim.claimToken, {
			revision: 1,
			contentManifestId: 'standalone-composite-manifest',
			contentId: content.id,
			response: {compositionId: 'standalone-composition', revision: 1},
		});
		const replay = await repository.claim(input);
		assert.equal(replay.disposition, 'replay');
		assert.equal(replay.result.fileCatalogItemId, undefined);
		assert.equal(replay.result.contentId, content.id);
	});

	it('checkpoints the durable candidate and fences stale claim tokens', async () => {
		const input = getClaimInput(`${targetPrefix}-checkpoint`, {value: 'checkpoint'});
		const claim = await repository.claim(input);
		const candidate = await models.Content.create({name: `${targetPrefix}-candidate`});
		await repository.checkpoint(claim.operation.id, claim.claimToken, {
			stickerContentManifestIds: ['sticker-manifest'],
			compositeContentManifestId: 'candidate-manifest',
		}, candidate.id);

		const stored = await repository.find(input);
		assert.equal(Number(stored.candidateContentId), Number(candidate.id));
		assert.deepEqual(JSON.parse(stored.recoveryJson), {
			stickerContentManifestIds: ['sticker-manifest'],
			compositeContentManifestId: 'candidate-manifest',
		});
		await assert.rejects(
			() => repository.checkpoint(claim.operation.id, 'stale-token', {}, candidate.id),
			(error: Error) => error.message === 'image_composition_operation_claim_lost',
		);
	});

	it('recovers failed work with a new guarded claim and retained recovery data', async () => {
		const input = getClaimInput(`${targetPrefix}-failed`, {value: 'failed'});
		const firstClaim = await repository.claim(input);
		const staleContent = await models.Content.create({name: `${targetPrefix}-stale-result`});
		const staleCatalogItem = await models.FileCatalogItem.create({name: `${targetPrefix}-stale-item`});
		await repository.fail(
			firstClaim.operation.id,
			firstClaim.claimToken,
			'composition_storage_failed',
			{orphanContentManifestIds: ['orphan-manifest']}
		);

		const failed = await repository.find(input);
		assert.equal(failed.state, ImageCompositionOperationState.Failed);
		assert.deepEqual(JSON.parse(failed.recoveryJson), {orphanContentManifestIds: ['orphan-manifest']});

		const retryClaim = await repository.claim(input);
		assert.equal(retryClaim.disposition, 'claimed');
		assert.notEqual(retryClaim.claimToken, firstClaim.claimToken);
		assert.equal(retryClaim.operation.attemptCount, 2);
		await assert.rejects(
			() => repository.succeed(firstClaim.operation.id, firstClaim.claimToken, {
				fileCatalogItemId: staleCatalogItem.id,
				revision: 1,
				contentManifestId: 'stale-manifest',
				contentId: staleContent.id,
			}),
			(error: Error) => error.message === 'image_composition_operation_claim_lost'
		);
	});

	it('recovers an expired pending claim but not a live pending claim', async () => {
		const start = new Date('2026-07-20T12:00:00.000Z');
		const input = {
			...getClaimInput(`${targetPrefix}-expired`, {value: 'expired'}),
			now: start,
			claimTtlMs: 1_000
		};
		const firstClaim = await repository.claim(input);
		const liveDuplicate = await repository.claim({...input, now: new Date(start.getTime() + 999)});
		const recovered = await repository.claim({...input, now: new Date(start.getTime() + 1_000)});

		assert.equal(firstClaim.disposition, 'claimed');
		assert.equal(liveDuplicate.disposition, 'pending');
		assert.equal(recovered.disposition, 'claimed');
		assert.notEqual(recovered.claimToken, firstClaim.claimToken);
		assert.equal(recovered.operation.attemptCount, 2);
	});

	it('scopes identical keys independently by actor, kind, and target', async () => {
		const base = getClaimInput(`${targetPrefix}-scope-a`, {value: 'scope'});
		const claims = await Promise.all([
			repository.claim(base),
			repository.claim({...base, actorUserId: base.actorUserId + 1}),
			repository.claim({...base, operationKind: 'content-revision'}),
			repository.claim({...base, targetKey: `${targetPrefix}-scope-b`})
		]);

		assert.deepEqual(claims.map((claim) => claim.disposition), ['claimed', 'claimed', 'claimed', 'claimed']);
		assert.equal(await models.ImageCompositionOperation.count({
			where: {targetKey: {[Op.like]: `${targetPrefix}%`}}
		}), 4);
	});
});

function getClaimInput(targetKey: string, request) {
	return {
		actorUserId: 12001,
		operationKind: 'content-create' as const,
		targetKey,
		idempotencyKey: 'idempotency-key',
		requestHash: createImageCompositionRequestHash(request)
	};
}

function getIdentityWhere(input) {
	return {
		actorUserId: input.actorUserId,
		operationKind: input.operationKind,
		targetKey: input.targetKey,
		idempotencyKey: input.idempotencyKey
	};
}
