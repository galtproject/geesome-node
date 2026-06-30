import {ActivityPubFlagState} from './interface.js';

type IRecordInboundFlagOptions = {
	localActorRecord: any;
	remoteActorUrl: string;
	activity: any;
	objectId: string;
};

export async function recordInboundActivityPubFlag(models, options: IRecordInboundFlagOptions) {
	const remoteActorRecord = await getRemoteActorRecord(models, options.remoteActorUrl);
	if (!remoteActorRecord) {
		throwActivityPubError('activitypub_remote_actor_record_required', 401);
	}
	const flagData = getInboundFlagRecordData(options, remoteActorRecord);
	return syncInboundFlagRecord(models, flagData);
}

async function syncInboundFlagRecord(models, flagData) {
	const existingFlag = await getInboundFlagRecord(models, flagData);
	if (existingFlag) {
		return updateFlagRecord(existingFlag, flagData);
	}

	try {
		return await models.ActivityPubFlag.create(flagData);
	} catch (e) {
		if (!isActivityPubFlagUniqueError(e)) {
			throw e;
		}
		const createdFlag = await getInboundFlagRecord(models, flagData);
		if (!createdFlag) {
			throw e;
		}
		return updateFlagRecord(createdFlag, flagData);
	}
}

async function updateFlagRecord(flagRecord, flagData) {
	const updateData = getChangedFlagData(flagRecord, flagData);
	if (!Object.keys(updateData).length) {
		return flagRecord;
	}
	await flagRecord.update(updateData);
	return flagRecord;
}

async function getInboundFlagRecord(models, flagData) {
	return models.ActivityPubFlag.findOne({
		where: {
			activityId: flagData.activityId
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

function getInboundFlagRecordData(options: IRecordInboundFlagOptions, remoteActorRecord) {
	return {
		localActorId: options.localActorRecord.id,
		remoteActorId: remoteActorRecord.id,
		activityId: getRequiredActivityId(options.activity),
		objectId: options.objectId,
		state: ActivityPubFlagState.Pending,
		rawActivityJson: JSON.stringify(options.activity)
	};
}

function getChangedFlagData(flagRecord, flagData) {
	const updateData = {};
	Object.keys(flagData).forEach((key) => {
		if (flagRecord[key] === flagData[key]) {
			return;
		}
		updateData[key] = flagData[key];
	});
	return updateData;
}

function getRequiredActivityId(activity): string {
	if (typeof activity?.id === 'string' && activity.id) {
		return activity.id;
	}
	throwActivityPubError('activitypub_flag_activity_id_required', 400);
}

function isActivityPubFlagUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function throwActivityPubError(message: string, code: number): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
