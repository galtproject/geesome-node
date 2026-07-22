import {createHash, randomUUID} from 'node:crypto';
import {Op, Sequelize} from 'sequelize';
import {ImageCompositionOperationState} from './models/imageCompositionOperation.js';

const DEFAULT_CLAIM_TTL_MS = 5 * 60 * 1000;

export type ImageCompositionOperationKind = 'content-create' | 'content-revision';

export interface ImageCompositionOperationIdentity {
	actorUserId: number;
	operationKind: ImageCompositionOperationKind;
	targetKey: string;
	idempotencyKey: string;
}

export interface ImageCompositionOperationClaimInput extends ImageCompositionOperationIdentity {
	requestHash: string;
	now?: Date;
	claimTtlMs?: number;
}

export interface ImageCompositionOperationResult {
	fileCatalogItemId?: number;
	revision: number;
	contentManifestId: string;
	contentId: number;
	response?: unknown;
}

export interface ImageCompositionOperationClaim {
	disposition: 'claimed' | 'pending' | 'replay';
	operation: any;
	claimToken?: string;
	result?: ImageCompositionOperationResult;
}

export function createImageCompositionRequestHash(request: unknown): string {
	return `sha256:${createHash('sha256').update(canonicalizeImageCompositionRequest(request), 'utf8').digest('hex')}`;
}

export function canonicalizeImageCompositionRequest(request: unknown): string {
	return serializeCanonicalJson(request, new Set());
}

export function createImageCompositionOperationRepository(
	sequelize: Sequelize,
	models,
	options: {claimTtlMs?: number; now?: () => Date; createClaimToken?: () => string} = {}
) {
	const ImageCompositionOperation = models.ImageCompositionOperation;
	if (!ImageCompositionOperation) {
		throw new Error('image_composition_operation_model_required');
	}
	const defaultClaimTtlMs = getClaimTtlMs(options.claimTtlMs, DEFAULT_CLAIM_TTL_MS);
	const getNow = options.now || (() => new Date());
	const createClaimToken = options.createClaimToken || randomUUID;

	return {
		async claim(input: ImageCompositionOperationClaimInput): Promise<ImageCompositionOperationClaim> {
			validateClaimInput(input);
			const now = input.now || getNow();
			const claimTtlMs = getClaimTtlMs(input.claimTtlMs, defaultClaimTtlMs);
			const claimToken = createClaimToken();
			const claimExpiresAt = new Date(now.getTime() + claimTtlMs);
			let operation;

			try {
				operation = await ImageCompositionOperation.create({
					...getIdentityWhere(input),
					requestHash: input.requestHash,
					state: ImageCompositionOperationState.Pending,
					claimToken,
					claimExpiresAt,
					attemptCount: 1
				});
				return {disposition: 'claimed', operation, claimToken};
			} catch (error) {
				if (!isUniqueConstraintError(error)) {
					throw error;
				}
			}

			operation = await ImageCompositionOperation.findOne({where: getIdentityWhere(input)});
			if (!operation) {
				throw new Error('image_composition_operation_claim_failed');
			}
			assertMatchingRequestHash(operation, input.requestHash);

			if (operation.state === ImageCompositionOperationState.Succeeded) {
				return {
					disposition: 'replay',
					operation,
					result: getStoredResult(operation)
				};
			}

			const reclaimWhere: any = {
				id: operation.id,
				requestHash: input.requestHash,
				[Op.or]: [
					{state: ImageCompositionOperationState.Failed},
					{
						state: ImageCompositionOperationState.Pending,
						claimExpiresAt: {[Op.lte]: now}
					}
				]
			};
			const [claimedCount] = await ImageCompositionOperation.update({
				state: ImageCompositionOperationState.Pending,
				claimToken,
				claimExpiresAt,
				attemptCount: sequelize.literal('"attemptCount" + 1'),
				errorCode: null,
				failedAt: null
			}, {where: reclaimWhere});

			operation = await ImageCompositionOperation.findByPk(operation.id);
			if (claimedCount === 1) {
				return {disposition: 'claimed', operation, claimToken};
			}
			if (operation?.state === ImageCompositionOperationState.Succeeded) {
				return {
					disposition: 'replay',
					operation,
					result: getStoredResult(operation)
				};
			}
			return {disposition: 'pending', operation};
		},

		async succeed(operationId: number, claimToken: string, result: ImageCompositionOperationResult) {
			validateResult(result);
			const now = getNow();
			const [updatedCount] = await ImageCompositionOperation.update({
				state: ImageCompositionOperationState.Succeeded,
				resultFileCatalogItemId: result.fileCatalogItemId ?? null,
				resultRevision: result.revision,
				resultContentManifestId: result.contentManifestId,
				resultContentId: result.contentId,
				candidateContentId: null,
				resultJson: result.response === undefined ? null : JSON.stringify(result.response),
				claimToken: null,
				claimExpiresAt: null,
				recoveryJson: null,
				errorCode: null,
				failedAt: null,
				succeededAt: now
			}, {
				where: {
					id: operationId,
					state: ImageCompositionOperationState.Pending,
					claimToken
				}
			});
			assertClaimUpdated(updatedCount);
			return ImageCompositionOperation.findByPk(operationId);
		},

		async checkpoint(operationId: number, claimToken: string, recovery: unknown, candidateContentId?: number) {
			const claimExpiresAt = new Date(getNow().getTime() + defaultClaimTtlMs);
			const [updatedCount] = await ImageCompositionOperation.update({
				recoveryJson: JSON.stringify(recovery),
				claimExpiresAt,
				...(candidateContentId ? {candidateContentId} : {}),
			}, {where: {id: operationId, state: ImageCompositionOperationState.Pending, claimToken}});
			assertClaimUpdated(updatedCount);
			return ImageCompositionOperation.findByPk(operationId);
		},

		async fail(operationId: number, claimToken: string, errorCode: string, recovery?: unknown) {
			const now = getNow();
			const [updatedCount] = await ImageCompositionOperation.update({
				state: ImageCompositionOperationState.Failed,
				claimToken: null,
				claimExpiresAt: null,
				recoveryJson: recovery === undefined ? null : JSON.stringify(recovery),
				errorCode,
				failedAt: now,
				succeededAt: null
			}, {
				where: {
					id: operationId,
					state: ImageCompositionOperationState.Pending,
					claimToken
				}
			});
			assertClaimUpdated(updatedCount);
			return ImageCompositionOperation.findByPk(operationId);
		},

		async find(identity: ImageCompositionOperationIdentity) {
			return ImageCompositionOperation.findOne({where: getIdentityWhere(identity)});
		}
	};
}

function serializeCanonicalJson(value: unknown, ancestors: Set<object>): string {
	if (value === null) {
		return 'null';
	}
	if (typeof value === 'string' || typeof value === 'boolean') {
		return JSON.stringify(value);
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new Error('image_composition_request_not_json');
		}
		return JSON.stringify(Object.is(value, -0) ? 0 : value);
	}
	if (typeof value !== 'object') {
		throw new Error('image_composition_request_not_json');
	}
	if (ancestors.has(value)) {
		throw new Error('image_composition_request_not_json');
	}
	ancestors.add(value);
	try {
		if (Array.isArray(value)) {
			return `[${value.map((item) => serializeCanonicalJson(item, ancestors)).join(',')}]`;
		}
		const record = value as Record<string, unknown>;
		const entries = Object.keys(record).sort().map((key) => {
			return `${JSON.stringify(key)}:${serializeCanonicalJson(record[key], ancestors)}`;
		});
		return `{${entries.join(',')}}`;
	} finally {
		ancestors.delete(value);
	}
}

function getIdentityWhere(identity: ImageCompositionOperationIdentity) {
	return {
		actorUserId: identity.actorUserId,
		operationKind: identity.operationKind,
		targetKey: identity.targetKey,
		idempotencyKey: identity.idempotencyKey
	};
}

function assertMatchingRequestHash(operation, requestHash: string) {
	if (operation.requestHash === requestHash) {
		return;
	}
	const error = new Error('composition_idempotency_conflict') as Error & {code?: number};
	error.code = 409;
	throw error;
}

function getStoredResult(operation): ImageCompositionOperationResult {
	return {
		...(operation.resultFileCatalogItemId == null ? {} : {fileCatalogItemId: Number(operation.resultFileCatalogItemId)}),
		revision: Number(operation.resultRevision),
		contentManifestId: operation.resultContentManifestId,
		contentId: Number(operation.resultContentId),
		response: parseStoredJson(operation.resultJson)
	};
}

function parseStoredJson(value) {
	if (typeof value !== 'string' || !value) {
		return undefined;
	}
	return JSON.parse(value);
}

function validateClaimInput(input: ImageCompositionOperationClaimInput) {
	if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) {
		throw new Error('image_composition_operation_actor_required');
	}
	if (!['content-create', 'content-revision'].includes(input.operationKind)) {
		throw new Error('image_composition_operation_kind_invalid');
	}
	if (!input.targetKey || !input.idempotencyKey || !input.requestHash) {
		throw new Error('image_composition_operation_identity_required');
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(input.requestHash)) {
		throw new Error('image_composition_operation_request_hash_invalid');
	}
}

function validateResult(result: ImageCompositionOperationResult) {
	if (result.fileCatalogItemId !== undefined
		&& (!Number.isSafeInteger(result.fileCatalogItemId) || result.fileCatalogItemId <= 0)) {
		throw new Error('image_composition_operation_result_file_catalog_item_invalid');
	}
	if (!result.contentManifestId) {
		throw new Error('image_composition_operation_result_content_required');
	}
	if (!Number.isSafeInteger(result.contentId) || result.contentId <= 0) {
		throw new Error('image_composition_operation_result_content_id_required');
	}
	if (!Number.isSafeInteger(result.revision) || result.revision <= 0) {
		throw new Error('image_composition_operation_result_revision_required');
	}
}

function getClaimTtlMs(value: number | undefined, fallback: number): number {
	if (Number.isFinite(value) && Number(value) > 0) {
		return Number(value);
	}
	return fallback;
}

function assertClaimUpdated(updatedCount: number) {
	if (updatedCount === 1) {
		return;
	}
	throw new Error('image_composition_operation_claim_lost');
}

function isUniqueConstraintError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}
