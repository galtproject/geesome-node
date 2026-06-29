import type {IGroup} from '../group/interface.js';
import {getActivityPubGroupActorUrls} from './helpers.js';
import {buildActivityPubFollowAcceptActivity} from './serializers.js';
import {
	ActivityPubDeliveryState,
	ActivityPubFollowState,
	IResolvedActivityPubConfig
} from './interface.js';

type IEnqueueFollowAcceptDeliveryOptions = {
	config: IResolvedActivityPubConfig;
	group: IGroup;
	localActorRecord: any;
	followRecord: any;
	followActivity: any;
	now?: Date | string;
};

export async function enqueueActivityPubFollowAcceptDelivery(models, options: IEnqueueFollowAcceptDeliveryOptions) {
	if (options.followRecord.state !== ActivityPubFollowState.Accepted) {
		return null;
	}
	const remoteActorRecord = await getRemoteActorRecord(models, options.followRecord.remoteActorId);
	const inboxUrl = getRemoteActorDeliveryInboxUrl(remoteActorRecord);
	const activityId = getFollowAcceptActivityId(options.config, options.group, options.followRecord);
	const body = buildActivityPubFollowAcceptActivity(options.config, options.group, options.followActivity, {activityId});
	const deliveryData = {
		localActorId: options.localActorRecord.id,
		remoteActorId: remoteActorRecord.id,
		followId: options.followRecord.id,
		activityId,
		activityType: 'Accept',
		inboxUrl,
		bodyJson: JSON.stringify(body),
		state: ActivityPubDeliveryState.Pending,
		attempts: 0,
		nextAttemptAt: getDeliveryAttemptDate(options.now),
		deliveredAt: null,
		lastError: null
	};

	return syncActivityPubDeliveryRecord(models, deliveryData);
}

async function syncActivityPubDeliveryRecord(models, deliveryData) {
	const existingDelivery = await getActivityPubDeliveryRecord(models, deliveryData);
	if (existingDelivery) {
		return updateActivityPubDeliveryRecord(existingDelivery, deliveryData);
	}

	try {
		return await models.ActivityPubDelivery.create(deliveryData);
	} catch (e) {
		if (!isActivityPubDeliveryUniqueError(e)) {
			throw e;
		}
		const createdDelivery = await getActivityPubDeliveryRecord(models, deliveryData);
		if (!createdDelivery) {
			throw e;
		}
		return updateActivityPubDeliveryRecord(createdDelivery, deliveryData);
	}
}

async function updateActivityPubDeliveryRecord(deliveryRecord, deliveryData) {
	const updateData = getChangedDeliveryData(deliveryRecord, deliveryData);
	if (!Object.keys(updateData).length) {
		return deliveryRecord;
	}
	await deliveryRecord.update(updateData);
	return deliveryRecord;
}

async function getActivityPubDeliveryRecord(models, deliveryData) {
	return models.ActivityPubDelivery.findOne({
		where: {
			activityId: deliveryData.activityId,
			inboxUrl: deliveryData.inboxUrl
		}
	});
}

async function getRemoteActorRecord(models, remoteActorId: number) {
	const remoteActorRecord = await models.ActivityPubRemoteActor.findOne({
		where: {
			id: remoteActorId
		}
	});
	if (!remoteActorRecord) {
		throwActivityPubError('activitypub_delivery_remote_actor_required', 400);
	}
	return remoteActorRecord;
}

function getRemoteActorDeliveryInboxUrl(remoteActorRecord): string {
	if (remoteActorRecord.sharedInboxUrl) {
		return remoteActorRecord.sharedInboxUrl;
	}
	if (remoteActorRecord.inboxUrl) {
		return remoteActorRecord.inboxUrl;
	}
	throwActivityPubError('activitypub_remote_actor_inbox_required', 400);
}

function getFollowAcceptActivityId(config: IResolvedActivityPubConfig, group: IGroup, followRecord): string {
	return `${getActivityPubGroupActorUrls(config, group).actorUrl}/activities/follows/${followRecord.id}/accept`;
}

function getChangedDeliveryData(deliveryRecord, deliveryData) {
	const updateData = {};
	const stableDeliveryData = getStableDeliveryUpdateData(deliveryRecord, deliveryData);

	Object.keys(stableDeliveryData).forEach((key) => {
		if (isSameDeliveryValue(deliveryRecord[key], stableDeliveryData[key])) {
			return;
		}
		updateData[key] = stableDeliveryData[key];
	});
	return updateData;
}

function getStableDeliveryUpdateData(deliveryRecord, deliveryData) {
	return {
		...deliveryData,
		state: deliveryRecord.state,
		attempts: deliveryRecord.attempts,
		nextAttemptAt: deliveryRecord.nextAttemptAt,
		deliveredAt: deliveryRecord.deliveredAt,
		lastError: deliveryRecord.lastError
	};
}

function isSameDeliveryValue(left, right): boolean {
	if (left instanceof Date || right instanceof Date) {
		return toDateTime(left) === toDateTime(right);
	}
	return left === right;
}

function getDeliveryAttemptDate(value?: Date | string): Date {
	if (value) {
		return new Date(value);
	}
	return new Date();
}

function toDateTime(value): number | null {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	return date.getTime();
}

function isActivityPubDeliveryUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function throwActivityPubError(message: string, code: number): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
