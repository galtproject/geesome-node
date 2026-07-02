import type {IGroup} from '../group/interface.js';
import {
	ActivityPubFollowDirection,
	ActivityPubFollowState
} from './interface.js';

type IRecordInboundFollowOptions = {
	group: IGroup;
	localActorRecord: any;
	remoteActorUrl: string;
	activity: any;
	now?: Date | string;
};

type IRecordInboundFollowUndoOptions = {
	localActorRecord: any;
	remoteActorUrl: string;
	undoActivity: any;
	followActivity: any;
	now?: Date | string;
};

type IRecordOutboundFollowOptions = {
	localActorRecord: any;
	remoteActorRecord: any;
	activity: any;
	now?: Date | string;
};

type IRecordOutboundFollowResponseOptions = {
	localActorRecord: any;
	remoteActorUrl: string;
	activity: any;
	followActivityId?: string;
	state: ActivityPubFollowState.Accepted | ActivityPubFollowState.Rejected;
	now?: Date | string;
};

type IRecordInboundBlockOptions = {
	localActorRecord: any;
	remoteActorUrl: string;
	activity: any;
	now?: Date | string;
};

export async function recordInboundActivityPubFollow(models, options: IRecordInboundFollowOptions) {
	const remoteActorRecord = await getRemoteActorRecord(models, options.remoteActorUrl);
	if (!remoteActorRecord) {
		throwActivityPubError('activitypub_remote_actor_record_required', 401);
	}
	const followData = getInboundFollowRecordData(options, remoteActorRecord);
	return syncFollowRecord(models, followData);
}

export async function recordInboundActivityPubFollowUndo(models, options: IRecordInboundFollowUndoOptions) {
	const remoteActorRecord = await getRemoteActorRecord(models, options.remoteActorUrl);
	if (!remoteActorRecord) {
		throwActivityPubError('activitypub_remote_actor_record_required', 401);
	}
	const followData = getInboundFollowUndoRecordData(options, remoteActorRecord);
	return syncFollowRecord(models, followData);
}

export async function recordInboundActivityPubBlock(models, options: IRecordInboundBlockOptions) {
	const remoteActorRecord = await getRemoteActorRecord(models, options.remoteActorUrl);
	if (!remoteActorRecord) {
		throwActivityPubError('activitypub_remote_actor_record_required', 401);
	}
	const followData = getInboundBlockRecordData(options, remoteActorRecord);
	return syncFollowRecord(models, followData);
}

export async function recordOutboundActivityPubFollow(models, options: IRecordOutboundFollowOptions) {
	const followData = getOutboundFollowRecordData(options);
	return syncFollowRecord(models, followData);
}

export async function recordOutboundActivityPubFollowResponse(models, options: IRecordOutboundFollowResponseOptions) {
	const remoteActorRecord = await getRemoteActorRecord(models, options.remoteActorUrl);
	if (!remoteActorRecord) {
		throwActivityPubError('activitypub_remote_actor_record_required', 401);
	}
	const followRecord = await getOutboundFollowRecord(models, options.localActorRecord.id, remoteActorRecord.id);
	if (!followRecord) {
		throwActivityPubError('activitypub_outbound_follow_not_found', 404);
	}
	assertOutboundFollowActivityIdMatches(followRecord, options.followActivityId);
	const followData = getOutboundFollowResponseRecordData(options, remoteActorRecord, followRecord);
	return updateFollowRecord(followRecord, followData);
}

async function syncFollowRecord(models, followData) {
	const existingFollow = await getActivityPubFollowRecord(models, followData);
	if (existingFollow) {
		return updateFollowRecord(existingFollow, followData);
	}

	try {
		return await models.ActivityPubFollow.create(followData);
	} catch (e) {
		if (!isActivityPubFollowUniqueError(e)) {
			throw e;
		}
		const createdFollow = await getActivityPubFollowRecord(models, followData);
		if (!createdFollow) {
			throw e;
		}
		return updateFollowRecord(createdFollow, followData);
	}
}

async function updateFollowRecord(followRecord, followData) {
	const updateData = getChangedFollowData(followRecord, followData);
	if (!Object.keys(updateData).length) {
		return followRecord;
	}
	await followRecord.update(updateData);
	return followRecord;
}

async function getActivityPubFollowRecord(models, followData) {
	return models.ActivityPubFollow.findOne({
		where: {
			localActorId: followData.localActorId,
			remoteActorId: followData.remoteActorId,
			direction: followData.direction
		}
	});
}

async function getOutboundFollowRecord(models, localActorId: number, remoteActorId: number) {
	return models.ActivityPubFollow.findOne({
		where: {
			localActorId,
			remoteActorId,
			direction: ActivityPubFollowDirection.Outbound
		}
	});
}

async function getRemoteActorRecord(models, actorUrl: string) {
	return models.ActivityPubRemoteActor.findOne({
		where: {
			actorUrl
		}
	});
}

function getInboundFollowRecordData(options: IRecordInboundFollowOptions, remoteActorRecord) {
	const state = getInboundFollowState(options.group);
	const now = getFollowEventDate(options.now);

	return {
		localActorId: options.localActorRecord.id,
		remoteActorId: remoteActorRecord.id,
		direction: ActivityPubFollowDirection.Inbound,
		state,
		remoteActivityId: getActivityId(options.activity),
		acceptedAt: state === ActivityPubFollowState.Accepted ? now : null,
		rejectedAt: null,
		rawActivityJson: JSON.stringify(options.activity)
	};
}

function getOutboundFollowRecordData(options: IRecordOutboundFollowOptions) {
	return {
		localActorId: options.localActorRecord.id,
		remoteActorId: options.remoteActorRecord.id,
		direction: ActivityPubFollowDirection.Outbound,
		state: ActivityPubFollowState.Pending,
		remoteActivityId: getActivityId(options.activity),
		acceptedAt: null,
		rejectedAt: null,
		rawActivityJson: JSON.stringify(options.activity)
	};
}

function getOutboundFollowResponseRecordData(
	options: IRecordOutboundFollowResponseOptions,
	remoteActorRecord,
	followRecord
) {
	const now = getFollowEventDate(options.now);

	return {
		localActorId: options.localActorRecord.id,
		remoteActorId: remoteActorRecord.id,
		direction: ActivityPubFollowDirection.Outbound,
		state: options.state,
		remoteActivityId: followRecord.remoteActivityId || options.followActivityId,
		acceptedAt: options.state === ActivityPubFollowState.Accepted ? now : null,
		rejectedAt: options.state === ActivityPubFollowState.Rejected ? now : null,
		rawActivityJson: JSON.stringify(options.activity)
	};
}

function getInboundFollowUndoRecordData(options: IRecordInboundFollowUndoOptions, remoteActorRecord) {
	const now = getFollowEventDate(options.now);

	return {
		localActorId: options.localActorRecord.id,
		remoteActorId: remoteActorRecord.id,
		direction: ActivityPubFollowDirection.Inbound,
		state: ActivityPubFollowState.Cancelled,
		remoteActivityId: getActivityId(options.followActivity) || getActivityId(options.undoActivity),
		acceptedAt: null,
		rejectedAt: now,
		rawActivityJson: JSON.stringify(options.undoActivity)
	};
}

function getInboundBlockRecordData(options: IRecordInboundBlockOptions, remoteActorRecord) {
	const now = getFollowEventDate(options.now);

	return {
		localActorId: options.localActorRecord.id,
		remoteActorId: remoteActorRecord.id,
		direction: ActivityPubFollowDirection.Inbound,
		state: ActivityPubFollowState.Cancelled,
		remoteActivityId: getActivityId(options.activity),
		acceptedAt: null,
		rejectedAt: now,
		rawActivityJson: JSON.stringify(options.activity)
	};
}

function getChangedFollowData(followRecord, followData) {
	const updateData = {};
	const normalizedFollowData = getStableFollowUpdateData(followRecord, followData);

	Object.keys(normalizedFollowData).forEach((key) => {
		if (isSameFollowValue(followRecord[key], normalizedFollowData[key])) {
			return;
		}
		updateData[key] = normalizedFollowData[key];
	});
	return updateData;
}

function getStableFollowUpdateData(followRecord, followData) {
	if (shouldKeepAcceptedOutboundFollow(followRecord, followData)) {
		return {
			...followData,
			state: followRecord.state,
			acceptedAt: followRecord.acceptedAt
		};
	}
	if (followRecord.rejectedAt && followData.rejectedAt && followRecord.state === followData.state) {
		return {
			...followData,
			rejectedAt: followRecord.rejectedAt
		};
	}
	if (!followRecord.acceptedAt || !followData.acceptedAt) {
		return followData;
	}
	return {
		...followData,
		acceptedAt: followRecord.acceptedAt
	};
}

function shouldKeepAcceptedOutboundFollow(followRecord, followData): boolean {
	return followRecord.direction === ActivityPubFollowDirection.Outbound
		&& followRecord.state === ActivityPubFollowState.Accepted
		&& followData.state === ActivityPubFollowState.Pending;
}

function assertOutboundFollowActivityIdMatches(followRecord, followActivityId?: string): void {
	if (!followActivityId || !followRecord.remoteActivityId || followRecord.remoteActivityId === followActivityId) {
		return;
	}
	throwActivityPubError('activitypub_outbound_follow_response_mismatch', 400);
}

function isSameFollowValue(left, right): boolean {
	if (left instanceof Date || right instanceof Date) {
		return toDateTime(left) === toDateTime(right);
	}
	return left === right;
}

function getInboundFollowState(group: IGroup): ActivityPubFollowState {
	if (group.isOpen === false) {
		return ActivityPubFollowState.Pending;
	}
	return ActivityPubFollowState.Accepted;
}

function getActivityId(activity): string | undefined {
	if (typeof activity?.id === 'string' && activity.id) {
		return activity.id;
	}
	return undefined;
}

function getFollowEventDate(value?: Date | string): Date {
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

function isActivityPubFollowUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function throwActivityPubError(message: string, code: number): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
