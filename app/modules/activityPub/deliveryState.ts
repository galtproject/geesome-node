import {Op} from 'sequelize';
import type {IGroup} from '../group/interface.js';
import {activityPubContentType, getActivityPubGroupActorUrls} from './helpers.js';
import {buildActivityPubFollowAcceptActivity} from './serializers.js';
import {signActivityPubRequestWithKey} from './signatureHelpers.js';
import {
	ActivityPubDeliveryState,
	ActivityPubFollowState,
	IActivityPubDeliveryProcessOptions,
	IActivityPubDeliveryProcessResult,
	IActivityPubDeliveryRequest,
	IActivityPubDeliveryRequestSender,
	IResolvedActivityPubConfig
} from './interface.js';

const defaultActivityPubDeliveryLimit = 20;
const defaultActivityPubDeliveryRetryDelayMs = 5 * 60 * 1000;
const defaultActivityPubDeliveryMaxAttempts = 5;

type IEnqueueFollowAcceptDeliveryOptions = {
	config: IResolvedActivityPubConfig;
	group: IGroup;
	localActorRecord: any;
	followRecord: any;
	followActivity: any;
	now?: Date | string;
};

type IProcessActivityPubDeliveryQueueOptions = IActivityPubDeliveryProcessOptions & {
	getActorKey: (actorRecord: any) => Promise<any>;
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

export async function processActivityPubDeliveryQueue(models, options: IProcessActivityPubDeliveryQueueOptions): Promise<IActivityPubDeliveryProcessResult> {
	const now = getDeliveryAttemptDate(options.now);
	const deliveries = await getDueActivityPubDeliveries(models, now, options);
	const result = {
		processed: 0,
		delivered: 0,
		failed: 0
	};

	for (const deliveryRecord of deliveries) {
		result.processed += 1;
		if (await processActivityPubDelivery(models, deliveryRecord, now, options)) {
			result.delivered += 1;
		} else {
			result.failed += 1;
		}
	}

	return result;
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

async function getDueActivityPubDeliveries(models, now: Date, options: IActivityPubDeliveryProcessOptions) {
	return models.ActivityPubDelivery.findAll({
		where: {
			state: ActivityPubDeliveryState.Pending,
			nextAttemptAt: {
				[Op.lte]: now
			}
		},
		order: [['nextAttemptAt', 'ASC'], ['id', 'ASC']],
		limit: getDeliveryProcessLimit(options)
	});
}

async function processActivityPubDelivery(models, deliveryRecord, now: Date, options: IProcessActivityPubDeliveryQueueOptions): Promise<boolean> {
	try {
		const request = await getSignedActivityPubDeliveryRequest(models, deliveryRecord, now, options);
		const response = await getDeliveryRequestSender(options)(request);
		assertActivityPubDeliveryResponseOk(response);
		await markActivityPubDeliveryDelivered(deliveryRecord, now);
		return true;
	} catch (e) {
		await markActivityPubDeliveryFailed(deliveryRecord, now, e, options);
		return false;
	}
}

async function getSignedActivityPubDeliveryRequest(models, deliveryRecord, now: Date, options: IProcessActivityPubDeliveryQueueOptions): Promise<IActivityPubDeliveryRequest> {
	const actorRecord = await getLocalActorRecord(models, deliveryRecord.localActorId);
	const actorKey = await options.getActorKey(actorRecord);
	const signedRequest = signActivityPubRequestWithKey(actorKey, {
		method: 'POST',
		url: deliveryRecord.inboxUrl,
		body: deliveryRecord.bodyJson,
		date: now,
		headers: {
			'Content-Type': activityPubContentType
		}
	});

	return {
		delivery: deliveryRecord,
		method: 'POST',
		url: deliveryRecord.inboxUrl,
		headers: signedRequest.headers,
		body: deliveryRecord.bodyJson
	};
}

async function getLocalActorRecord(models, localActorId: number) {
	const actorRecord = await models.ActivityPubActor.findOne({
		where: {
			id: localActorId
		}
	});
	if (!actorRecord) {
		throwActivityPubError('activitypub_delivery_local_actor_required', 400);
	}
	return actorRecord;
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

async function markActivityPubDeliveryDelivered(deliveryRecord, now: Date) {
	await deliveryRecord.update({
		state: ActivityPubDeliveryState.Delivered,
		attempts: getDeliveryAttempts(deliveryRecord) + 1,
		deliveredAt: now,
		lastError: null
	});
}

async function markActivityPubDeliveryFailed(deliveryRecord, now: Date, error, options: IActivityPubDeliveryProcessOptions) {
	const attempts = getDeliveryAttempts(deliveryRecord) + 1;
	const permanentlyFailed = attempts >= getDeliveryMaxAttempts(options);
	await deliveryRecord.update({
		state: permanentlyFailed ? ActivityPubDeliveryState.Failed : ActivityPubDeliveryState.Pending,
		attempts,
		nextAttemptAt: permanentlyFailed ? deliveryRecord.nextAttemptAt : getNextDeliveryAttemptAt(now, attempts, options),
		lastError: getDeliveryErrorMessage(error)
	});
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

function getNextDeliveryAttemptAt(now: Date, attempts: number, options: IActivityPubDeliveryProcessOptions): Date {
	return new Date(now.getTime() + getDeliveryRetryDelayMs(options) * attempts);
}

function getDeliveryAttempts(deliveryRecord): number {
	const attempts = Number(deliveryRecord.attempts);
	if (Number.isFinite(attempts) && attempts >= 0) {
		return attempts;
	}
	return 0;
}

function getDeliveryProcessLimit(options: IActivityPubDeliveryProcessOptions): number {
	return parsePositiveInteger(options.limit, defaultActivityPubDeliveryLimit);
}

function getDeliveryRetryDelayMs(options: IActivityPubDeliveryProcessOptions): number {
	return parsePositiveInteger(options.retryDelayMs, defaultActivityPubDeliveryRetryDelayMs);
}

function getDeliveryMaxAttempts(options: IActivityPubDeliveryProcessOptions): number {
	return parsePositiveInteger(options.maxAttempts, defaultActivityPubDeliveryMaxAttempts);
}

function parsePositiveInteger(value, fallback: number): number {
	const parsed = Number.parseInt(value as any, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
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

function getDeliveryRequestSender(options: IActivityPubDeliveryProcessOptions): IActivityPubDeliveryRequestSender {
	return options.deliverActivityPubRequest || deliverActivityPubRequestWithFetch;
}

async function deliverActivityPubRequestWithFetch(request: IActivityPubDeliveryRequest) {
	if (typeof globalThis.fetch !== 'function') {
		throwActivityPubError('activitypub_delivery_fetch_unavailable', 501);
	}
	const response = await globalThis.fetch(request.url, {
		method: request.method,
		headers: request.headers,
		body: request.body
	});

	return {
		ok: response.ok,
		status: response.status,
		statusText: response.statusText
	};
}

function assertActivityPubDeliveryResponseOk(response): void {
	if (response === undefined || response === null) {
		return;
	}
	if (response.ok === true) {
		return;
	}
	const status = Number(response.status);
	if (Number.isFinite(status) && status >= 200 && status < 300) {
		return;
	}
	throwActivityPubError(`activitypub_delivery_request_failed:${response.status || 'unknown'}`, 502);
}

function getDeliveryErrorMessage(error): string {
	if (typeof error?.message === 'string') {
		return error.message;
	}
	return String(error || 'activitypub_delivery_unknown_error');
}

function throwActivityPubError(message: string, code: number): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
