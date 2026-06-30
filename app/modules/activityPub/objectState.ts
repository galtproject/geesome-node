import type {IGroup, IPost} from '../group/interface.js';
import type {IContentData} from '../database/interface.js';
import {buildActivityPubPostCreateActivity} from './serializers.js';
import {
	ActivityPubObjectOrigin,
	ActivityPubObjectVisibility
} from './interface.js';
import type {IResolvedActivityPubConfig} from './interface.js';

type ISyncLocalPostActivityPubObjectOptions = {
	config: IResolvedActivityPubConfig;
	group: IGroup;
	post: IPost;
	contents?: IContentData[];
	localActorRecord: any;
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
