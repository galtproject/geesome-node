import helpers from '../../helpers.js';
import {sanitizeAbsoluteHref} from '../../htmlSafety.js';
import {activityPubPublicCollection} from './helpers.js';
import {getActivityPubRemoteActorRecord} from './remoteActorCache.js';
import {isActivityPubReviewObjectType} from './reviewObjectTypes.js';
import {syncRemoteActivityPubObject} from './objectState.js';
import type {IActivityPubRemoteActorCacheOptions} from './remoteActorCache.js';
import type {
	IActivityPubSourceJsonFetcher,
	IActivityPubSourceRefreshInput,
	IActivityPubSourceRefreshResult
} from './interface.js';

type IActivityPubSourceRefreshOptions = IActivityPubRemoteActorCacheOptions & {
	fetchActivityPubSourceJson?: IActivityPubSourceJsonFetcher;
};
type IActivityPubSourceRefreshWorkResult = Omit<IActivityPubSourceRefreshResult, 'source'>;

const activityPubSourceRefreshDefaultLimit = 20;
const activityPubSourceRefreshMaxLimit = 50;
export async function refreshActivityPubSourceSubscription(
	models,
	subscription,
	input: IActivityPubSourceRefreshInput,
	options: IActivityPubSourceRefreshOptions
): Promise<IActivityPubSourceRefreshWorkResult> {
	const remoteActorRecord = await getActivityPubSourceRefreshRemoteActor(models, subscription, options);
	const targetUrls = getActivityPubSourceRefreshTargetUrls(remoteActorRecord, input);
	const result = getEmptyActivityPubSourceRefreshWorkResult();
	const seenObjectIds = new Set<string>();
	const limit = getActivityPubSourceRefreshLimit(input);

	if (!targetUrls.length) {
		result.errors.push('activitypub_source_refresh_collection_not_found');
		return result;
	}

	for (const targetUrl of targetUrls) {
		if (result.fetched >= limit) {
			break;
		}
		try {
			const remainingLimit = limit - result.fetched;
			const items = await fetchActivityPubSourceCollectionItems(targetUrl, options, remainingLimit);
			for (const item of items) {
				if (result.fetched >= limit) {
					break;
				}
				result.fetched += 1;
				try {
					const cached = await cacheActivityPubSourceRefreshItem(models, remoteActorRecord, item, options, seenObjectIds);
					if (cached) {
						result.cached += 1;
					} else {
						result.skipped += 1;
					}
				} catch (e) {
					result.errors.push(getActivityPubSourceRefreshErrorMessage(e));
				}
			}
		} catch (e) {
			result.errors.push(getActivityPubSourceRefreshErrorMessage(e));
		}
	}

	return result;
}

export function getActivityPubSourceRefreshUpdateData(errors: string[]) {
	return {
		lastRefreshRequestedAt: new Date(),
		lastError: getActivityPubSourceRefreshLastError(errors)
	};
}

async function getActivityPubSourceRefreshRemoteActor(models, subscription, options: IActivityPubSourceRefreshOptions) {
	const cachedRemoteActor = await models.ActivityPubRemoteActor.findOne({
		where: {
			id: subscription.remoteActorId
		}
	});
	const actorUrl = subscription.sourceActorUrl || cachedRemoteActor?.actorUrl;
	if (!actorUrl) {
		throwActivityPubSourceRefreshError('activitypub_source_remote_actor_not_found', 404);
	}
	return getActivityPubRemoteActorRecord(models, actorUrl, options);
}

function getEmptyActivityPubSourceRefreshWorkResult(): IActivityPubSourceRefreshWorkResult {
	return {
		fetched: 0,
		cached: 0,
		skipped: 0,
		errors: []
	};
}

function getActivityPubSourceRefreshLimit(input: IActivityPubSourceRefreshInput): number {
	return Math.min(
		helpers.parsePositiveInteger(input?.limit, activityPubSourceRefreshDefaultLimit),
		activityPubSourceRefreshMaxLimit
	);
}

function getActivityPubSourceRefreshTargetUrls(remoteActorRecord, input: IActivityPubSourceRefreshInput): string[] {
	const actorJson = parseActivityPubJson(remoteActorRecord.rawJson) || {};
	const targetUrls: string[] = [];
	if (helpers.parseBoolean(input?.includeFeatured, true)) {
		addActivityPubSourceRefreshTargetUrl(targetUrls, actorJson.featured);
	}
	if (helpers.parseBoolean(input?.includeOutbox, true)) {
		addActivityPubSourceRefreshTargetUrl(targetUrls, actorJson.outbox);
	}
	return [...new Set(targetUrls)];
}

function addActivityPubSourceRefreshTargetUrl(targetUrls: string[], value): void {
	const targetUrl = sanitizeAbsoluteHref(value);
	if (targetUrl) {
		targetUrls.push(targetUrl);
	}
}

async function fetchActivityPubSourceCollectionItems(targetUrl: string, options: IActivityPubSourceRefreshOptions, limit: number): Promise<any[]> {
	if (limit <= 0) {
		return [];
	}
	const collection = await fetchActivityPubSourceJson(targetUrl, options);
	const directItems = getActivityPubSourceCollectionItems(collection);
	if (directItems.length) {
		return directItems.slice(0, limit);
	}

	const firstPage = await getActivityPubSourceCollectionFirstPage(collection, options);
	if (!firstPage) {
		return [];
	}
	return getActivityPubSourceCollectionItems(firstPage).slice(0, limit);
}

async function getActivityPubSourceCollectionFirstPage(collection, options: IActivityPubSourceRefreshOptions): Promise<any | null> {
	const page = collection?.first || collection?.current;
	if (typeof page === 'string' && page) {
		return fetchActivityPubSourceJson(page, options);
	}
	if (page && typeof page === 'object' && !Array.isArray(page)) {
		return page;
	}
	return null;
}

function getActivityPubSourceCollectionItems(collection): any[] {
	if (Array.isArray(collection?.orderedItems)) {
		return collection.orderedItems;
	}
	if (Array.isArray(collection?.items)) {
		return collection.items;
	}
	return [];
}

async function cacheActivityPubSourceRefreshItem(
	models,
	remoteActorRecord,
	item,
	options: IActivityPubSourceRefreshOptions,
	seenObjectIds: Set<string>
): Promise<boolean> {
	const resolved = await getActivityPubSourceRefreshActivityAndObject(remoteActorRecord, item, options);
	if (!resolved || !isActivityPubSourceRefreshObjectCacheable(remoteActorRecord, resolved.activity, resolved.object)) {
		return false;
	}

	const objectId = getRequiredObjectId(resolved.object, 'activitypub_source_refresh_object_id_required');
	if (seenObjectIds.has(objectId)) {
		return false;
	}
	seenObjectIds.add(objectId);

	await syncRemoteActivityPubObject(models, {
		remoteActorRecord,
		activity: resolved.activity,
		object: resolved.object
	});
	return true;
}

async function getActivityPubSourceRefreshActivityAndObject(remoteActorRecord, item, options: IActivityPubSourceRefreshOptions) {
	const itemJson = await getActivityPubSourceRefreshReferencedJson(item, options);
	if (!itemJson) {
		return null;
	}
	if (getActivityType(itemJson) === 'Create') {
		return getActivityPubSourceRefreshCreateActivityAndObject(itemJson, options);
	}

	const object = getActivityPubSourceRefreshReviewObject(itemJson);
	if (!object) {
		return null;
	}
	return {
		activity: buildActivityPubSourceRefreshCreateActivity(remoteActorRecord, object),
		object
	};
}

async function getActivityPubSourceRefreshCreateActivityAndObject(activity, options: IActivityPubSourceRefreshOptions) {
	const object = await getActivityPubSourceRefreshReviewObjectByReference(activity?.object, options);
	if (!object) {
		return null;
	}
	return {
		activity,
		object
	};
}

async function getActivityPubSourceRefreshReviewObjectByReference(value, options: IActivityPubSourceRefreshOptions) {
	const object = await getActivityPubSourceRefreshReferencedJson(value, options);
	return getActivityPubSourceRefreshReviewObject(object);
}

async function getActivityPubSourceRefreshReferencedJson(value, options: IActivityPubSourceRefreshOptions) {
	if (typeof value === 'string' && value) {
		return fetchActivityPubSourceJson(value, options);
	}
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value;
	}
	return null;
}

function getActivityPubSourceRefreshReviewObject(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	if (!isActivityPubSourceRefreshReviewObjectType(value.type)) {
		return null;
	}
	return value;
}

function isActivityPubSourceRefreshObjectCacheable(remoteActorRecord, activity, object): boolean {
	return isActivityPubSourceRefreshObjectFromActor(remoteActorRecord, activity, object)
		&& isActivityPubSourceRefreshObjectPublic(activity, object);
}

function isActivityPubSourceRefreshObjectFromActor(remoteActorRecord, activity, object): boolean {
	const activityActor = getActivityActor(activity);
	if (activityActor && activityActor !== remoteActorRecord.actorUrl) {
		return false;
	}

	const objectActors = getActivityPubSourceRefreshObjectActorValues(object);
	if (objectActors.length) {
		return objectActors.includes(remoteActorRecord.actorUrl);
	}
	return activityActor === remoteActorRecord.actorUrl;
}

function isActivityPubSourceRefreshObjectPublic(activity, object): boolean {
	return getActivityPubSourceRefreshAudience(activity, object).includes(activityPubPublicCollection);
}

function getActivityPubSourceRefreshObjectActorValues(object): string[] {
	return [
		...getActivityPubReferenceValues(object?.attributedTo),
		...getActivityPubReferenceValues(object?.actor)
	];
}

function getActivityPubSourceRefreshAudience(activity, object): string[] {
	return [
		...getActivityPubReferenceValues(activity?.to),
		...getActivityPubReferenceValues(activity?.cc),
		...getActivityPubReferenceValues(object?.to),
		...getActivityPubReferenceValues(object?.cc)
	];
}

function getActivityPubReferenceValues(value): string[] {
	if (typeof value === 'string') {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap((item) => getActivityPubReferenceValues(item));
	}
	if (typeof value?.id === 'string' && value.id) {
		return [value.id];
	}
	return [];
}

function buildActivityPubSourceRefreshCreateActivity(remoteActorRecord, object) {
	const objectId = getRequiredObjectId(object, 'activitypub_source_refresh_object_id_required');
	return {
		'@context': 'https://www.w3.org/ns/activitystreams',
		id: `${objectId}#geesome-source-refresh-create`,
		type: 'Create',
		actor: remoteActorRecord.actorUrl,
		to: getActivityPubReferenceValues(object.to),
		cc: getActivityPubReferenceValues(object.cc),
		published: object.published,
		object
	};
}

async function fetchActivityPubSourceJson(url: string, options: IActivityPubSourceRefreshOptions) {
	if (options.fetchActivityPubSourceJson) {
		return options.fetchActivityPubSourceJson(url);
	}
	if (typeof globalThis.fetch !== 'function') {
		throwActivityPubSourceRefreshError('activitypub_source_refresh_fetch_unavailable', 501);
	}

	let response;
	try {
		response = await globalThis.fetch(url, {
			headers: {
				Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/ld+json, application/json'
			}
		});
	} catch (e) {
		throwActivityPubSourceRefreshError('activitypub_source_refresh_fetch_failed', 401);
	}
	if (!response.ok) {
		throwActivityPubSourceRefreshError(`activitypub_source_refresh_fetch_failed:${response.status}`, 401);
	}
	try {
		return await response.json();
	} catch (e) {
		throwActivityPubSourceRefreshError('activitypub_source_refresh_json_invalid', 401);
	}
}

function getActivityPubSourceRefreshLastError(errors: string[]): string | null {
	if (!errors.length) {
		return null;
	}
	return errors.slice(0, 3).join('; ').slice(0, 1000);
}

function getActivityPubSourceRefreshErrorMessage(error): string {
	return getOptionalBoundedString(error?.message || String(error), 500) || 'activitypub_source_refresh_error';
}

function getOptionalBoundedString(value, maxLength: number): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	return value.trim().slice(0, maxLength);
}

function parseActivityPubJson(rawJson: string) {
	try {
		return JSON.parse(rawJson);
	} catch (e) {
		return null;
	}
}

function getActivityType(activity): string | undefined {
	return typeof activity?.type === 'string' ? activity.type : undefined;
}

function getActivityActor(activity): string | undefined {
	if (typeof activity?.actor === 'string') {
		return activity.actor;
	}
	if (typeof activity?.actor?.id === 'string') {
		return activity.actor.id;
	}
	return undefined;
}

function getRequiredObjectId(object, message: string): string {
	if (typeof object?.id === 'string' && object.id) {
		return object.id;
	}
	throwActivityPubSourceRefreshError(message, 400);
}

function isActivityPubSourceRefreshReviewObjectType(objectType): boolean {
	return isActivityPubReviewObjectType(objectType);
}

function throwActivityPubSourceRefreshError(message: string, code = 400): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
