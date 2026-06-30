import type {IGroup, IPost} from '../group/interface.js';
import type {IContentData} from '../database/interface.js';
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
	targetObjectRecord: any;
	activity: any;
	object: any;
};

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

export async function getLocalActivityPubObjectByObjectId(models, objectId: string) {
	return models.ActivityPubObject.findOne({
		where: {
			objectId,
			origin: ActivityPubObjectOrigin.Local
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
		localActorId: options.targetObjectRecord.localActorId || null,
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

function getActivityPubObjectUrl(object, objectId: string): string {
	if (typeof object?.url === 'string' && object.url) {
		return object.url;
	}
	return objectId;
}

function getActivityPubObjectVisibility(activity, object): ActivityPubObjectVisibility {
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
	return ActivityPubObjectVisibility.Direct;
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

function throwActivityPubObjectError(message: string): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = 400;
	throw error;
}
