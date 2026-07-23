import {QueryTypes} from 'sequelize';
import {
	confirmedPinStorageObjectStatuses,
	PinStorageObjectStatus,
	requestedPinReconciliationDelayMs
} from './stateHelpers.js';

export async function getPinAccountHealthSummary(sequelize, accountId: number, now: Date) {
	const rows = await sequelize.query(`
		SELECT
			COUNT(*)::bigint AS "totalCount",
			COUNT(*) FILTER (WHERE status = :requestedStatus)::bigint AS "requestedCount",
			COUNT(*) FILTER (WHERE status = :acceptedStatus)::bigint AS "acceptedCount",
			COUNT(*) FILTER (WHERE status IN (:confirmedStatuses))::bigint AS "confirmedCount",
			COUNT(*) FILTER (WHERE status = :missingStatus)::bigint AS "missingCount",
			COUNT(*) FILTER (WHERE status = :retryableFailureStatus)::bigint AS "retryableFailureCount",
			COUNT(*) FILTER (WHERE status = :terminalFailureStatus)::bigint AS "terminalFailureCount",
			COUNT(*) FILTER (
				WHERE status IN (:reconciliableStatuses)
					AND (
						"nextCheckAt" <= :now
						OR (
							"nextCheckAt" IS NULL
							AND status IN (:unplannedDueStatuses)
						)
						OR (
							status = :requestedStatus
							AND "lastAttemptAt" <= :requestedBefore
						)
					)
					AND (
						"reconcileClaimExpiresAt" IS NULL
						OR "reconcileClaimExpiresAt" <= :now
					)
			)::bigint AS "dueReconciliationCount",
			COUNT(*) FILTER (WHERE "reconcileClaimExpiresAt" > :now)::bigint AS "activeClaimCount",
			MAX("checkedAt") AS "lastCheckedAt",
			MAX("checkedAt") FILTER (WHERE status IN (:confirmedStatuses)) AS "lastSuccessfulCheckAt"
		FROM "pinStorageObjects"
		WHERE "pinAccountId" = :accountId
	`, {
		replacements: {
			accountId,
			now,
			requestedBefore: new Date(now.getTime() - requestedPinReconciliationDelayMs),
			requestedStatus: PinStorageObjectStatus.Requested,
			acceptedStatus: PinStorageObjectStatus.Accepted,
			confirmedStatuses: confirmedPinStorageObjectStatuses,
			missingStatus: PinStorageObjectStatus.Missing,
			retryableFailureStatus: PinStorageObjectStatus.RetryableFailure,
			terminalFailureStatus: PinStorageObjectStatus.TerminalFailure,
			reconciliableStatuses: getReconciliableStatuses(),
			unplannedDueStatuses: [PinStorageObjectStatus.Accepted, PinStorageObjectStatus.RetryableFailure]
		},
		type: QueryTypes.SELECT
	});
	return rows[0] || {};
}

export function getPinAccountHealthResponse(account, summary, lastError, recent) {
	return {
		accountId: Number(account.id),
		service: account.service || undefined,
		totalCount: readCount(summary.totalCount),
		statusCounts: getStatusCounts(summary),
		dueReconciliationCount: readCount(summary.dueReconciliationCount),
		activeClaimCount: readCount(summary.activeClaimCount),
		lastCheckedAt: summary.lastCheckedAt || null,
		lastSuccessfulCheckAt: summary.lastSuccessfulCheckAt || null,
		lastError: getPinAccountLastError(lastError),
		recent: recent.map(row => getPinStorageObjectHealthEntry(row))
	};
}

export function getPinStorageObjectHealthAttributes() {
	return [
		'storageId',
		'status',
		'attemptCount',
		'reconcileAttemptCount',
		'lastAttemptAt',
		'lastReconcileAt',
		'checkedAt',
		'nextCheckAt',
		'lastErrorCode',
		'lastErrorMessage'
	];
}

function getStatusCounts(summary) {
	return {
		requested: readCount(summary.requestedCount),
		accepted: readCount(summary.acceptedCount),
		confirmed: readCount(summary.confirmedCount),
		missing: readCount(summary.missingCount),
		retryableFailure: readCount(summary.retryableFailureCount),
		terminalFailure: readCount(summary.terminalFailureCount)
	};
}

function getPinAccountLastError(row) {
	const data = getPlainPinRow(row);
	if (!data) {
		return null;
	}
	return {
		storageId: data.storageId,
		status: data.status,
		code: data.lastErrorCode || null,
		message: data.lastErrorMessage || null,
		failedAt: data.failedAt || null
	};
}

function getPinStorageObjectHealthEntry(row) {
	const data = getPlainPinRow(row);
	return {
		storageId: data.storageId,
		status: data.status,
		attemptCount: readCount(data.attemptCount),
		reconcileAttemptCount: readCount(data.reconcileAttemptCount),
		lastAttemptAt: data.lastAttemptAt || null,
		lastReconcileAt: data.lastReconcileAt || null,
		checkedAt: data.checkedAt || null,
		nextCheckAt: data.nextCheckAt || null,
		lastErrorCode: data.lastErrorCode || null,
		lastErrorMessage: data.lastErrorMessage || null
	};
}

function getPlainPinRow(row) {
	if (!row) {
		return null;
	}
	return typeof row.toJSON === 'function' ? row.toJSON() : row;
}

function readCount(value): number {
	const count = Number(value || 0);
	return Number.isFinite(count) && count >= 0 ? count : 0;
}

function getReconciliableStatuses() {
	return [
		PinStorageObjectStatus.Requested,
		PinStorageObjectStatus.Accepted,
		PinStorageObjectStatus.Confirmed,
		PinStorageObjectStatus.RetryableFailure
	];
}
