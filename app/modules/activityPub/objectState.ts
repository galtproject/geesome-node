import type {IGroup, IPost} from '../group/interface.js';
import type {IContentData} from '../database/interface.js';
import {sanitizeAbsoluteHref} from '../../htmlSafety.js';
import {buildActivityPubPostCreateActivity} from './serializers.js';
import {
	ActivityPubObjectOrigin,
	ActivityPubObjectVisibility
} from './interface.js';
import {activityPubPublicCollection} from './helpers.js';
import type {IResolvedActivityPubConfig} from './interface.js';

type ISyncLocalPostActivityPubObjectOptions = {
	config: IResolvedActivityPubConfig;
	group: IGroup;
	post: IPost;
	contents?: IContentData[];
	localActorRecord: any;
};

type ISyncRemoteActivityPubObjectOptions = {
	remoteActorRecord: any;
	targetObjectRecord?: any;
	localActorRecord?: any;
	activity: any;
	object: any;
};

type IUpdateRemoteActivityPubObjectOptions = {
	remoteActorRecord: any;
	activity: any;
	object: any;
};

type ITombstoneRemoteActivityPubObjectOptions = {
	remoteActorRecord: any;
	activity: any;
	objectId?: string;
	objectNotFoundMessage?: string;
	actorMismatchMessage?: string;
};

const activityPubTombstoneObjectType = 'Tombstone';

export async function syncLocalPostActivityPubObject(models, options: ISyncLocalPostActivityPubObjectOptions) {
	if (!options.post?.id) {
		return null;
	}
	const objectData = getLocalPostActivityPubObjectData(options);
	const existingObject = await getActivityPubObjectRecord(models, objectData);
	if (existingObject) {
		return updateActivityPubObjectRecord(existingObject, objectData);
	}

	try {
		return await models.ActivityPubObject.create(objectData);
	} catch (e) {
		if (!isActivityPubObjectUniqueError(e)) {
			throw e;
		}
		const createdObject = await getActivityPubObjectRecord(models, objectData);
		if (!createdObject) {
			throw e;
		}
		return updateActivityPubObjectRecord(createdObject, objectData);
	}
}

export async function syncRemoteActivityPubObject(models, options: ISyncRemoteActivityPubObjectOptions) {
	const objectData = getRemoteActivityPubObjectData(options);
	const existingObject = await getActivityPubObjectRecord(models, objectData);
	if (existingObject) {
		assertRemoteActivityPubObjectActor(existingObject, options.remoteActorRecord, 'activitypub_create_object_actor_mismatch');
		assertActivityPubObjectNotTombstoned(existingObject);
		return updateActivityPubObjectRecord(existingObject, objectData);
	}

	try {
		return await models.ActivityPubObject.create(objectData);
	} catch (e) {
		if (!isActivityPubObjectUniqueError(e)) {
			throw e;
		}
		const createdObject = await getActivityPubObjectRecord(models, objectData);
		if (!createdObject) {
			throw e;
		}
		assertRemoteActivityPubObjectActor(createdObject, options.remoteActorRecord, 'activitypub_create_object_actor_mismatch');
		assertActivityPubObjectNotTombstoned(createdObject);
		return updateActivityPubObjectRecord(createdObject, objectData);
	}
}

export async function updateRemoteActivityPubObject(models, options: IUpdateRemoteActivityPubObjectOptions) {
	const objectId = getRequiredActivityPubObjectId(options.object);
	const existingObject = await getRemoteActivityPubObjectRecordByObjectId(models, objectId);
	if (!existingObject) {
		throwActivityPubObjectError('activitypub_update_object_not_found', 404);
	}
	assertRemoteActivityPubObjectActor(existingObject, options.remoteActorRecord, 'activitypub_update_object_actor_mismatch');
	assertActivityPubObjectNotTombstoned(existingObject);

	const objectData = getRemoteActivityPubObjectUpdateData(existingObject, options);
	const objectChanged = hasChangedActivityPubObjectData(existingObject, objectData);
	const objectRecord = await updateActivityPubObjectRecord(existingObject, objectData);
	objectRecord.activityPubObjectChanged = objectChanged;
	return objectRecord;
}

export async function tombstoneRemoteActivityPubObject(models, options: ITombstoneRemoteActivityPubObjectOptions) {
	const objectId = options.objectId || getRequiredActivityPubActivityObjectId(options.activity);
	const existingObject = await getRemoteActivityPubObjectRecordByObjectId(models, objectId);
	if (!existingObject) {
		throwActivityPubObjectError(options.objectNotFoundMessage || 'activitypub_delete_object_not_found', 404);
	}
	assertRemoteActivityPubObjectActor(existingObject, options.remoteActorRecord, options.actorMismatchMessage || 'activitypub_delete_object_actor_mismatch');

	return updateActivityPubObjectRecord(existingObject, {
		activityId: getRequiredActivityPubActivityId(options.activity),
		objectType: activityPubTombstoneObjectType,
		rawJson: JSON.stringify(options.activity)
	});
}

export async function getLocalActivityPubObjectByObjectId(models, objectId: string) {
	return models.ActivityPubObject.findOne({
		where: {
			objectId,
			origin: ActivityPubObjectOrigin.Local
		}
	});
}

async function getRemoteActivityPubObjectRecordByObjectId(models, objectId: string) {
	return models.ActivityPubObject.findOne({
		where: {
			objectId,
			origin: ActivityPubObjectOrigin.Remote
		}
	});
}

function getLocalPostActivityPubObjectData(options: ISyncLocalPostActivityPubObjectOptions) {
	const createActivity = buildActivityPubPostCreateActivity(options.config, options.group, options.post, {
		contents: options.contents || []
	});
	const noteObject = createActivity.object || {};

	return {
		localActorId: options.localActorRecord.id,
		localPostId: options.post.id,
		remoteActorId: null,
		remoteObjectUrl: null,
		activityId: createActivity.id,
		objectId: noteObject.id,
		objectType: noteObject.type,
		origin: ActivityPubObjectOrigin.Local,
		visibility: ActivityPubObjectVisibility.Public,
		publishedAt: getActivityPubObjectPublishedAt(noteObject),
		rawJson: JSON.stringify(noteObject)
	};
}

function getRemoteActivityPubObjectData(options: ISyncRemoteActivityPubObjectOptions) {
	const objectId = getRequiredActivityPubObjectId(options.object);

	return {
		localActorId: getRemoteActivityPubObjectLocalActorId(options),
		localPostId: null,
		remoteActorId: options.remoteActorRecord.id,
		remoteObjectUrl: getActivityPubObjectUrl(options.object, objectId),
		activityId: getRequiredActivityPubActivityId(options.activity),
		objectId,
		objectType: getRequiredActivityPubObjectType(options.object),
		origin: ActivityPubObjectOrigin.Remote,
		visibility: getActivityPubObjectVisibility(options.activity, options.object),
		publishedAt: getActivityPubObjectPublishedAt(options.object),
		rawJson: JSON.stringify(options.object)
	};
}

function getRemoteActivityPubObjectLocalActorId(options: ISyncRemoteActivityPubObjectOptions): number | null {
	return options.targetObjectRecord?.localActorId || options.localActorRecord?.id || null;
}

function getRemoteActivityPubObjectUpdateData(existingObject, options: IUpdateRemoteActivityPubObjectOptions) {
	const objectId = getRequiredActivityPubObjectId(options.object);

	return {
		remoteObjectUrl: getUpdatedActivityPubObjectUrl(existingObject, options.object, objectId),
		activityId: getRequiredActivityPubActivityId(options.activity),
		objectType: getRequiredActivityPubObjectType(options.object),
		visibility: getUpdatedActivityPubObjectVisibility(existingObject, options.activity, options.object),
		publishedAt: getUpdatedActivityPubObjectPublishedAt(existingObject, options.object),
		rawJson: JSON.stringify(options.object)
	};
}

async function updateActivityPubObjectRecord(objectRecord, objectData) {
	const updateData = getChangedActivityPubObjectData(objectRecord, objectData);
	if (!Object.keys(updateData).length) {
		return objectRecord;
	}
	await objectRecord.update(updateData);
	return objectRecord;
}

function getChangedActivityPubObjectData(objectRecord, objectData) {
	const updateData = {};
	Object.keys(objectData).forEach((key) => {
		if (isSameActivityPubObjectValue(objectRecord[key], objectData[key])) {
			return;
		}
		updateData[key] = objectData[key];
	});
	return updateData;
}

function hasChangedActivityPubObjectData(objectRecord, objectData) {
	return Object.keys(getChangedActivityPubObjectData(objectRecord, objectData)).length > 0;
}

async function getActivityPubObjectRecord(models, objectData) {
	return models.ActivityPubObject.findOne({
		where: {
			objectId: objectData.objectId
		}
	});
}

function getActivityPubObjectPublishedAt(noteObject): Date | null {
	if (!noteObject.published) {
		return null;
	}
	const publishedAt = new Date(noteObject.published);
	if (Number.isNaN(publishedAt.getTime())) {
		return null;
	}
	return publishedAt;
}

function getUpdatedActivityPubObjectPublishedAt(existingObject, object): Date | null {
	return getActivityPubObjectPublishedAt(object) || existingObject.publishedAt || null;
}

function getRequiredActivityPubActivityId(activity): string {
	if (typeof activity?.id === 'string' && activity.id) {
		return activity.id;
	}
	throwActivityPubObjectError('activitypub_activity_id_required');
}

function getRequiredActivityPubObjectId(object): string {
	if (typeof object?.id === 'string' && object.id) {
		return object.id;
	}
	throwActivityPubObjectError('activitypub_object_id_required');
}

function getRequiredActivityPubObjectType(object): string {
	if (typeof object?.type === 'string' && object.type) {
		return object.type;
	}
	throwActivityPubObjectError('activitypub_object_type_required');
}

function getRequiredActivityPubActivityObjectId(activity): string {
	if (typeof activity?.object === 'string' && activity.object) {
		return activity.object;
	}
	if (typeof activity?.object?.id === 'string' && activity.object.id) {
		return activity.object.id;
	}
	throwActivityPubObjectError('activitypub_activity_object_id_required');
}

function getActivityPubObjectUrl(object, objectId: string): string {
	const url = getSafeActivityPubObjectUrl(object);
	if (url) {
		return url;
	}
	return objectId;
}

function getUpdatedActivityPubObjectUrl(existingObject, object, objectId: string): string {
	const url = getSafeActivityPubObjectUrl(object);
	if (url) {
		return url;
	}
	const existingUrl = sanitizeAbsoluteHref(existingObject.remoteObjectUrl);
	if (existingUrl) {
		return existingUrl;
	}
	return objectId;
}

function getSafeActivityPubObjectUrl(object): string {
	if (typeof object?.url === 'string' && object.url) {
		return sanitizeAbsoluteHref(object.url);
	}
	return '';
}

function getActivityPubObjectVisibility(activity, object): ActivityPubObjectVisibility {
	return getActivityPubObjectAudienceVisibility(activity, object) || ActivityPubObjectVisibility.Direct;
}

function getUpdatedActivityPubObjectVisibility(existingObject, activity, object): ActivityPubObjectVisibility {
	return getActivityPubObjectAudienceVisibility(activity, object) || existingObject.visibility || ActivityPubObjectVisibility.Direct;
}

function getActivityPubObjectAudienceVisibility(activity, object): ActivityPubObjectVisibility | null {
	const audience = [
		...getActivityPubAudienceValues(activity?.to),
		...getActivityPubAudienceValues(activity?.cc),
		...getActivityPubAudienceValues(object?.to),
		...getActivityPubAudienceValues(object?.cc)
	];
	if (audience.includes(activityPubPublicCollection)) {
		return ActivityPubObjectVisibility.Public;
	}
	if (audience.length) {
		return ActivityPubObjectVisibility.Followers;
	}
	return null;
}

function getActivityPubAudienceValues(value): string[] {
	if (typeof value === 'string') {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.filter(item => typeof item === 'string');
	}
	return [];
}

function isSameActivityPubObjectValue(left, right): boolean {
	if (left instanceof Date || right instanceof Date) {
		return getComparableDateValue(left) === getComparableDateValue(right);
	}
	return left === right;
}

function getComparableDateValue(value): number | null {
	if (!value) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return date.getTime();
}

function isActivityPubObjectUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function assertRemoteActivityPubObjectActor(objectRecord, remoteActorRecord, message: string): void {
	if (
		objectRecord.origin === ActivityPubObjectOrigin.Remote &&
		Number(objectRecord.remoteActorId) === Number(remoteActorRecord.id)
	) {
		return;
	}
	throwActivityPubObjectError(message, 400);
}

function assertActivityPubObjectNotTombstoned(objectRecord): void {
	if (objectRecord.objectType !== activityPubTombstoneObjectType) {
		return;
	}
	throwActivityPubObjectError('activitypub_object_tombstoned', 410);
}

function throwActivityPubObjectError(message: string, code = 400): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
