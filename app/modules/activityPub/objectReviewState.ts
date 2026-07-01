import {Op} from 'sequelize';
import helpers from '../../helpers.js';
import {ActivityPubObjectReviewState} from './interface.js';

type ISetActivityPubObjectReviewStateOptions = {
	objectRecord: any;
	state: ActivityPubObjectReviewState;
	reviewedByUserId?: number;
	now?: Date | string;
};

export async function getActivityPubObjectReviewRecordsByObjectIds(models, objectIds) {
	const ids = helpers.normalizeUniqueIds(objectIds);
	if (!ids.length) {
		return [];
	}
	return models.ActivityPubObjectReview.findAll({
		where: {
			activityPubObjectId: {
				[Op.in]: ids
			}
		}
	});
}

export function getActivityPubObjectReviewByObjectId(reviewRecords) {
	return new Map(reviewRecords.map((review) => [Number(review.activityPubObjectId), review]));
}

export function getActivityPubObjectReviewState(reviewRecord): ActivityPubObjectReviewState {
	if (isKnownActivityPubObjectReviewState(reviewRecord?.state)) {
		return reviewRecord.state;
	}
	return ActivityPubObjectReviewState.Pending;
}

export function getRequiredActivityPubObjectReviewState(state): ActivityPubObjectReviewState {
	if (isKnownActivityPubObjectReviewState(state)) {
		return state;
	}
	throwActivityPubObjectReviewError('activitypub_object_review_state_invalid', 400);
}

export async function setActivityPubObjectReviewState(models, options: ISetActivityPubObjectReviewStateOptions) {
	const existingReview = await getActivityPubObjectReviewRecord(models, options.objectRecord.id);
	const reviewData = getActivityPubObjectReviewData(options, existingReview);
	if (existingReview) {
		return updateActivityPubObjectReviewRecord(existingReview, reviewData);
	}

	try {
		return await models.ActivityPubObjectReview.create(reviewData);
	} catch (e) {
		if (!isActivityPubObjectReviewUniqueError(e)) {
			throw e;
		}
		const createdReview = await getActivityPubObjectReviewRecord(models, options.objectRecord.id);
		if (!createdReview) {
			throw e;
		}
		return updateActivityPubObjectReviewRecord(createdReview, reviewData);
	}
}

export async function resetActivityPubObjectReviewState(models, objectRecord) {
	const existingReview = await getActivityPubObjectReviewRecord(models, objectRecord.id);
	if (!existingReview) {
		return null;
	}
	return updateActivityPubObjectReviewRecord(existingReview, {
		activityPubObjectId: objectRecord.id,
		state: ActivityPubObjectReviewState.Pending,
		reviewedAt: null,
		reviewedByUserId: null
	});
}

async function getActivityPubObjectReviewRecord(models, activityPubObjectId) {
	return models.ActivityPubObjectReview.findOne({
		where: {
			activityPubObjectId
		}
	});
}

async function updateActivityPubObjectReviewRecord(reviewRecord, reviewData) {
	const updateData = getChangedActivityPubObjectReviewData(reviewRecord, reviewData);
	if (!Object.keys(updateData).length) {
		return reviewRecord;
	}
	await reviewRecord.update(updateData);
	return reviewRecord;
}

function getActivityPubObjectReviewData(options: ISetActivityPubObjectReviewStateOptions, existingReview) {
	const reviewedByUserId = getActivityPubObjectReviewedByUserId(options);
	return {
		activityPubObjectId: options.objectRecord.id,
		state: options.state,
		reviewedAt: getActivityPubObjectReviewedAt(options, existingReview, reviewedByUserId),
		reviewedByUserId
	};
}

function getActivityPubObjectReviewedAt(options: ISetActivityPubObjectReviewStateOptions, existingReview, reviewedByUserId: number | null) {
	if (options.state === ActivityPubObjectReviewState.Pending) {
		return null;
	}
	if (isSameActivityPubObjectReviewDecision(existingReview, options.state, reviewedByUserId)) {
		return existingReview.reviewedAt || getReviewDate(options.now);
	}
	return getReviewDate(options.now);
}

function getActivityPubObjectReviewedByUserId(options: ISetActivityPubObjectReviewStateOptions): number | null {
	if (options.state === ActivityPubObjectReviewState.Pending) {
		return null;
	}
	const reviewedByUserId = Number(options.reviewedByUserId);
	if (!Number.isFinite(reviewedByUserId) || reviewedByUserId <= 0) {
		return null;
	}
	return reviewedByUserId;
}

function isSameActivityPubObjectReviewDecision(existingReview, state: ActivityPubObjectReviewState, reviewedByUserId: number | null): boolean {
	if (!existingReview) {
		return false;
	}
	return existingReview.state === state && normalizeNullableNumber(existingReview.reviewedByUserId) === reviewedByUserId;
}

function getChangedActivityPubObjectReviewData(reviewRecord, reviewData) {
	const updateData = {};
	Object.keys(reviewData).forEach((key) => {
		if (isSameActivityPubObjectReviewValue(reviewRecord[key], reviewData[key])) {
			return;
		}
		updateData[key] = reviewData[key];
	});
	return updateData;
}

function isSameActivityPubObjectReviewValue(left, right): boolean {
	if (left instanceof Date || right instanceof Date) {
		return getNullableDateTime(left) === getNullableDateTime(right);
	}
	return left === right;
}

function getReviewDate(now?: Date | string): Date {
	const date = now ? new Date(now) : new Date();
	if (Number.isNaN(date.getTime())) {
		return new Date();
	}
	return date;
}

function getNullableDateTime(value): number | null {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) {
		return null;
	}
	return date.getTime();
}

function normalizeNullableNumber(value): number | null {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) {
		return null;
	}
	return number;
}

function isKnownActivityPubObjectReviewState(state): state is ActivityPubObjectReviewState {
	return Object.values(ActivityPubObjectReviewState).includes(state);
}

function isActivityPubObjectReviewUniqueError(error): boolean {
	return error?.name === 'SequelizeUniqueConstraintError';
}

function throwActivityPubObjectReviewError(message: string, code: number): never {
	const error = new Error(message) as Error & {code?: number};
	error.code = code;
	throw error;
}
