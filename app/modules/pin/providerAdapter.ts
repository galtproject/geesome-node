import axios from 'axios';
import {IPinAccount} from './interface.js';
import {
	IPinProviderRequestOptions,
	normalizePinProviderEndpoint,
	normalizePinProviderError,
	pinataAuthenticationEndpoint,
	pinataEndpoint,
	pinataPinJobsEndpoint,
	pinataPinListEndpoint,
	preparePinProviderRequest
} from './providerRequest.js';
import {PinStorageObjectStatus} from './stateHelpers.js';

export interface IPinProviderInspectionResult {
	status: PinStorageObjectStatus.Accepted | PinStorageObjectStatus.Confirmed
		| PinStorageObjectStatus.Missing | PinStorageObjectStatus.TerminalFailure;
	remoteId?: string | null;
	result?: any;
	error?: Error;
}

export type IPinProviderInspector = (
	account: IPinAccount,
	storageId: string,
	signal: AbortSignal
) => Promise<IPinProviderInspectionResult>;

export type IPinProviderCredentialVerifier = (
	account: IPinAccount,
	signal: AbortSignal
) => Promise<{ok: true; service: string}>;

const terminalPinataJobStatuses = new Set([
	'expired',
	'over_free_limit',
	'over_max_size',
	'invalid_object',
	'bad_host_node'
]);

export function createPinProviderInspector(options: IPinProviderRequestOptions = {}): IPinProviderInspector {
	return async (account, storageId, signal) => {
		if (account.service !== 'pinata') {
			return getUnsupportedProviderInspection(account.service);
		}
		if (normalizePinProviderEndpoint(account.endpoint) !== pinataEndpoint) {
			return getUnsupportedProviderInspection('pinata_custom_endpoint');
		}
		try {
			const pinnedRow = await getPinataPinnedRow(account, storageId, signal, options);
			if (pinnedRow) {
				return {
					status: PinStorageObjectStatus.Confirmed,
					remoteId: pinnedRow.id || pinnedRow.ipfs_pin_hash || storageId,
					result: pinnedRow
				};
			}
			const pinJob = await getPinataPinJob(account, storageId, signal, options);
			if (!pinJob) {
				return {status: PinStorageObjectStatus.Missing, result: {storageId}};
			}
			const jobStatus = String(pinJob.status || '').toLowerCase();
			if (terminalPinataJobStatuses.has(jobStatus)) {
				return {
					status: PinStorageObjectStatus.TerminalFailure,
					remoteId: pinJob.id || null,
					result: pinJob,
					error: getPinataJobError(jobStatus)
				};
			}
			return {
				status: PinStorageObjectStatus.Accepted,
				remoteId: pinJob.id || null,
				result: pinJob
			};
		} catch (error) {
			throw normalizePinProviderError(error, [account.apiKey, account.secretApiKey]);
		}
	};
}

export function createPinProviderCredentialVerifier(
	options: IPinProviderRequestOptions = {}
): IPinProviderCredentialVerifier {
	return async (account, signal) => {
		if (account.service !== 'pinata') {
			throw getUnsupportedCredentialTest(account.service);
		}
		if (normalizePinProviderEndpoint(account.endpoint) !== pinataEndpoint) {
			throw getUnsupportedCredentialTest('pinata_custom_endpoint');
		}
		try {
			await getPinata(account, pinataAuthenticationEndpoint, undefined, signal, options);
			return {ok: true, service: 'pinata'};
		} catch (error) {
			throw normalizePinProviderError(error, [account.apiKey, account.secretApiKey]);
		}
	};
}

async function getPinataPinnedRow(account, storageId, signal, options) {
	const result = await getPinata(account, pinataPinListEndpoint, {
		cid: storageId,
		status: 'pinned',
		pageLimit: 1,
		includeCount: false
	}, signal, options);
	return Array.isArray(result?.data?.rows) ? result.data.rows[0] || null : null;
}

async function getPinataPinJob(account, storageId, signal, options) {
	const result = await getPinata(account, pinataPinJobsEndpoint, {
		ipfs_pin_hash: storageId,
		limit: 1,
		offset: 0
	}, signal, options);
	return Array.isArray(result?.data?.rows) ? result.data.rows[0] || null : null;
}

async function getPinata(account, endpoint, params, signal, options) {
	const providerRequest = await preparePinProviderRequest(endpoint, signal, options);
	try {
		return await axios.get(providerRequest.endpoint, {
			...providerRequest.config,
			params,
			headers: {
				pinata_api_key: account.apiKey,
				pinata_secret_api_key: account.secretApiKey
			}
		});
	} finally {
		providerRequest.dispose();
	}
}

function getUnsupportedProviderInspection(service): IPinProviderInspectionResult {
	const error = new Error(`pin_provider_reconciliation_unsupported:${service || 'unknown'}`) as Error & {retryable?: boolean};
	error.retryable = true;
	throw error;
}

function getUnsupportedCredentialTest(service) {
	const error = new Error(`pin_provider_credential_test_unsupported:${service || 'unknown'}`) as Error & {
		retryable?: boolean;
	};
	error.retryable = false;
	return error;
}

function getPinataJobError(status: string) {
	const error = new Error(`pinata_pin_job_${status}`) as Error & {retryable?: boolean};
	error.retryable = false;
	return error;
}
