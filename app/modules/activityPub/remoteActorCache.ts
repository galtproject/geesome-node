import type {
	IActivityPubRemoteActorFetcher,
	IActivityPubRemoteActorKey
} from './interface.js';

const defaultRemoteActorCacheMaxAgeMs = 12 * 60 * 60 * 1000;

export type IActivityPubRemoteActorCacheOptions = {
	fetchRemoteActor?: IActivityPubRemoteActorFetcher;
	remoteActorCacheMaxAgeMs?: number;
};

export async function getActivityPubRemoteActorKey(
	models,
	input: {keyId: string; actor?: string; activity?: any},
	options: IActivityPubRemoteActorCacheOptions = {}
): Promise<IActivityPubRemoteActorKey | null> {
	const cachedActor = await getCachedRemoteActorRecord(models, input);
	if (canUseRemoteActorRecord(cachedActor, input, options)) {
		return getRemoteActorKeyFromRecord(cachedActor);
	}

	const actorUrl = getRemoteActorLookupUrl(input, cachedActor);
	const actorJson = await fetchRemoteActorJson(actorUrl, options.fetchRemoteActor);
	const actorData = getRemoteActorRecordData(actorJson, input.keyId, actorUrl);
	const actorRecord = await syncRemoteActorRecord(models, cachedActor, actorData);

	return getRemoteActorKeyFromRecord(actorRecord);
}

export async function getActivityPubRemoteActorRecord(
	models,
	actorUrl: string,
	options: IActivityPubRemoteActorCacheOptions = {}
) {
	const lookupActorUrl = normalizeRemoteActorUrl(actorUrl);
	const cachedActor = await getRemoteActorRecordByActorUrl(models, lookupActorUrl);
	if (canUseRemoteActorRecordByActorUrl(cachedActor, options)) {
		return cachedActor;
	}

	const actorJson = await fetchRemoteActorJson(lookupActorUrl, options.fetchRemoteActor);
	const actorData = getRemoteActorRecordData(actorJson, undefined, lookupActorUrl);
	return syncRemoteActorRecord(models, cachedActor, actorData);
}

async function getCachedRemoteActorRecord(models, input: {keyId: string; actor?: string}) {
	const byKey = await getRemoteActorRecordByPublicKeyId(models, input.keyId);
	if (byKey) {
		return byKey;
	}
	const actorUrl = getOptionalRemoteActorUrl(input.actor);
	if (!actorUrl) {
		return null;
	}
	return getRemoteActorRecordByActorUrl(models, actorUrl);
}

async function getRemoteActorRecordByPublicKeyId(models, publicKeyId: string) {
	return findRemoteActorRecord(models, {publicKeyId});
}

async function getRemoteActorRecordByActorUrl(models, actorUrl: string) {
	return findRemoteActorRecord(models, {actorUrl});
}

async function findRemoteActorRecord(models, where) {
	return models.ActivityPubRemoteActor.findOne({where});
}

async function syncRemoteActorRecord(models, cachedActor, actorData) {
	const actorRecord = cachedActor
		|| await getRemoteActorRecordByPublicKeyId(models, actorData.publicKeyId)
		|| await getRemoteActorRecordByActorUrl(models, actorData.actorUrl);
	if (actorRecord) {
		return updateRemoteActorRecord(actorRecord, actorData);
	}

	try {
		return await models.ActivityPubRemoteActor.create(actorData);
	} catch (e) {
		if (!isActivityPubRemoteActorUniqueError(e)) {
			throw e;
		}
		const createdActor = await getRemoteActorRecordByPublicKeyId(models, actorData.publicKeyId)
			|| await getRemoteActorRecordByActorUrl(models, actorData.actorUrl);
		if (!createdActor) {
			throw e;
		}
		return updateRemoteActorRecord(createdActor, actorData);
	}
}

async function updateRemoteActorRecord(actorRecord, actorData) {
	const updateData = getChangedRemoteActorData(actorRecord, actorData);
	if (!Object.keys(updateData).length) {
		return actorRecord;
	}
	await actorRecord.update(updateData);
	return actorRecord;
}

async function fetchRemoteActorJson(actorUrl: string, fetchRemoteActor?: IActivityPubRemoteActorFetcher) {
	if (fetchRemoteActor) {
		return fetchRemoteActor(actorUrl);
	}
	if (typeof globalThis.fetch !== 'function') {
		throwActivityPubError('activitypub_remote_actor_fetch_unavailable', 501);
	}
	const response = await fetchRemoteActorResponse(actorUrl);
	if (!response.ok) {
		throwActivityPubError(`activitypub_remote_actor_fetch_failed:${response.status}`, 401);
	}
	try {
		return await response.json();
	} catch (e) {
		throwActivityPubError('activitypub_remote_actor_json_invalid', 401);
	}
}

async function fetchRemoteActorResponse(actorUrl: string) {
	try {
		return await globalThis.fetch(actorUrl, {
			headers: {
				Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/ld+json, application/json'
			}
		});
	} catch (e) {
		throwActivityPubError('activitypub_remote_actor_fetch_failed', 401);
	}
}

function getRemoteActorRecordData(actorJson, expectedKeyId: string | undefined, lookupActorUrl: string) {
	const actorUrl = getRemoteActorUrl(actorJson, lookupActorUrl);
	assertRemoteActorUrlMatchesLookup(actorUrl, lookupActorUrl);
	const publicKey = getRemoteActorPublicKey(actorJson, expectedKeyId);
	assertRemoteActorPublicKeyOwner(publicKey, actorUrl);

	return {
		actorUrl,
		publicKeyId: publicKey.id,
		preferredUsername: getOptionalString(actorJson.preferredUsername),
		domain: new URL(actorUrl).host,
		inboxUrl: getOptionalString(actorJson.inbox),
		sharedInboxUrl: getOptionalString(actorJson.endpoints?.sharedInbox),
		publicKeyPem: publicKey.publicKeyPem,
		lastFetchedAt: new Date(),
		rawJson: JSON.stringify(actorJson)
	};
}

function getChangedRemoteActorData(actorRecord, actorData) {
	const updateData = {};
	Object.keys(actorData).forEach((key) => {
		if (actorRecord[key] === actorData[key]) {
			return;
		}
		updateData[key] = actorData[key];
	});
	return updateData;
}

function canUseRemoteActorRecord(actorRecord, input: {keyId: string}, options: IActivityPubRemoteActorCacheOptions): boolean {
	if (!actorRecord) {
		return false;
	}
	if (actorRecord.publicKeyId !== input.keyId) {
		return false;
	}
	return !isRemoteActorRecordExpired(actorRecord, options);
}

function canUseRemoteActorRecordByActorUrl(actorRecord, options: IActivityPubRemoteActorCacheOptions): boolean {
	if (!actorRecord) {
		return false;
	}
	return !isRemoteActorRecordExpired(actorRecord, options);
}

function isRemoteActorRecordExpired(actorRecord, options: IActivityPubRemoteActorCacheOptions): boolean {
	const fetchedAt = new Date(actorRecord.lastFetchedAt);
	if (Number.isNaN(fetchedAt.getTime())) {
		return true;
	}
	const maxAgeMs = options.remoteActorCacheMaxAgeMs ?? defaultRemoteActorCacheMaxAgeMs;
	return Date.now() - fetchedAt.getTime() > maxAgeMs;
}

function getRemoteActorKeyFromRecord(actorRecord): IActivityPubRemoteActorKey {
	return {
		keyId: actorRecord.publicKeyId,
		actorUrl: actorRecord.actorUrl,
		publicKeyPem: actorRecord.publicKeyPem
	};
}

function getRemoteActorLookupUrl(input: {keyId: string; actor?: string}, cachedActor): string {
	const actorUrl = getOptionalRemoteActorUrl(input.actor);
	if (actorUrl) {
		return actorUrl;
	}
	if (cachedActor?.actorUrl) {
		return normalizeRemoteActorUrl(cachedActor.actorUrl);
	}
	return getRemoteActorUrlFromKeyId(input.keyId);
}

function getRemoteActorUrl(actorJson, lookupActorUrl: string): string {
	if (typeof actorJson?.id === 'string') {
		return normalizeRemoteActorUrl(actorJson.id);
	}
	return normalizeRemoteActorUrl(lookupActorUrl);
}

function getOptionalRemoteActorUrl(value?: string): string | null {
	if (!value) {
		return null;
	}
	return normalizeRemoteActorUrl(value);
}

function getRemoteActorUrlFromKeyId(keyId: string): string {
	try {
		const url = new URL(keyId);
		url.hash = '';
		return normalizeRemoteActorUrl(url.toString());
	} catch (e) {
		throwActivityPubError('activitypub_remote_actor_key_id_invalid', 401);
	}
}

function normalizeRemoteActorUrl(value: string): string {
	try {
		const url = new URL(value);
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			return url.toString();
		}
	} catch (e) {
		throwActivityPubError('activitypub_remote_actor_url_invalid', 401);
	}
	throwActivityPubError('activitypub_remote_actor_url_invalid', 401);
}

function assertRemoteActorUrlMatchesLookup(actorUrl: string, lookupActorUrl: string): void {
	if (actorUrl === normalizeRemoteActorUrl(lookupActorUrl)) {
		return;
	}
	throwActivityPubError('activitypub_remote_actor_id_mismatch', 401);
}

function getRemoteActorPublicKey(actorJson, expectedKeyId?: string) {
	const publicKeys = getRemoteActorPublicKeys(actorJson);
	const publicKey = getMatchingRemoteActorPublicKey(publicKeys, expectedKeyId);
	if (!publicKey) {
		throwActivityPubError('activitypub_remote_actor_public_key_not_found', 401);
	}
	if (typeof publicKey.publicKeyPem !== 'string' || !publicKey.publicKeyPem.trim()) {
		throwActivityPubError('activitypub_remote_actor_public_key_pem_required', 401);
	}
	return publicKey;
}

function getMatchingRemoteActorPublicKey(publicKeys: any[], expectedKeyId?: string) {
	if (expectedKeyId) {
		return publicKeys.find((item) => item.id === expectedKeyId);
	}
	return publicKeys.find((item) => typeof item?.id === 'string' && item.id);
}

function getRemoteActorPublicKeys(actorJson): any[] {
	if (Array.isArray(actorJson?.publicKey)) {
		return actorJson.publicKey.filter(Boolean);
	}
	if (actorJson?.publicKey) {
		return [actorJson.publicKey];
	}
	return [];
}

function assertRemoteActorPublicKeyOwner(publicKey, actorUrl: string): void {
	if (!publicKey.owner) {
		return;
	}
	if (normalizeRemoteActorUrl(publicKey.owner) === actorUrl) {
		return;
	}
	throwActivityPubError('activitypub_remote_actor_public_key_owner_mismatch', 401);
}

function getOptionalString(value): string | undefined {
	return typeof value === 'string' && value ? value : undefined;
}

function isActivityPubRemoteActorUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function throwActivityPubError(message: string, code: number): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
