import {randomUUID} from 'node:crypto';

export enum PinStorageObjectStatus {
	Requested = 'requested',
	Accepted = 'accepted',
	Confirmed = 'confirmed',
	Missing = 'missing',
	RetryableFailure = 'retryable_failure',
	TerminalFailure = 'terminal_failure'
}

export const legacyConfirmedPinStorageObjectStatus = 'pinned';
export const confirmedPinStorageObjectStatuses = [
	PinStorageObjectStatus.Confirmed,
	legacyConfirmedPinStorageObjectStatus
];
export const protectedPinStorageObjectStatuses = [
	PinStorageObjectStatus.Requested,
	PinStorageObjectStatus.Accepted,
	PinStorageObjectStatus.Confirmed,
	PinStorageObjectStatus.RetryableFailure,
	legacyConfirmedPinStorageObjectStatus
];
export const requestedPinReconciliationDelayMs = 5 * 60 * 1000;

const maxPinResultLength = 4096;
const maxPinErrorMessageLength = 1000;

export function getPinStorageObjectAttemptId() {
	return randomUUID();
}

export function getPinStorageObjectAttemptStatus(error): PinStorageObjectStatus {
	return error?.retryable === false
		? PinStorageObjectStatus.TerminalFailure
		: PinStorageObjectStatus.RetryableFailure;
}

export function getBoundedPinResultJson(value): string {
	let result;
	try {
		result = JSON.stringify(value ?? null);
	} catch (error) {
		result = JSON.stringify({error: 'pin_result_unserializable'});
	}
	return String(result).slice(0, maxPinResultLength);
}

export function getPinStorageObjectErrorCode(error): string {
	return String(error?.message || 'pin_provider_request_failed').slice(0, 100);
}

export function getPinStorageObjectErrorMessage(error): string {
	return String(error?.details || error?.message || 'pin_provider_request_failed')
		.slice(0, maxPinErrorMessageLength);
}
