import axios from "axios";
import {lookup as dnsLookup} from "node:dns/promises";
import {createSafeHttpsAgent} from "../../helpers/safeHttpsAgent.js";

export const pinataEndpoint = "https://api.pinata.cloud/pinning/pinByHash";
export const pinataAuthenticationEndpoint = "https://api.pinata.cloud/data/testAuthentication";
export const pinataPinListEndpoint = "https://api.pinata.cloud/data/pinList";
export const pinataPinJobsEndpoint = "https://api.pinata.cloud/pinning/pinJobs";

const defaultRequestTimeoutMs = 30000;
const minRequestTimeoutMs = 1000;
const maxRequestTimeoutMs = 120000;
const maxErrorDetailsLength = 1000;
const maxResponseLength = 64 * 1024;

export type IPinProviderRequestOptions = {
	requestTimeoutMs?: unknown;
	allowCustomEndpoints?: boolean;
	customEndpointHosts?: string[];
	lookup?: typeof dnsLookup;
};

type IPreparedPinProviderRequest = {
	endpoint: string;
	config: Record<string, any>;
	dispose: () => void;
};

export async function preparePinProviderRequest(
	endpointValue: unknown,
	signal: AbortSignal,
	options: IPinProviderRequestOptions = {}
): Promise<IPreparedPinProviderRequest> {
	const endpoint = normalizePinProviderEndpoint(endpointValue);
	const config: Record<string, any> = {
		timeout: getPinProviderRequestTimeoutMs(options.requestTimeoutMs),
		signal,
		maxRedirects: 0,
		maxContentLength: maxResponseLength
	};
	if ([pinataEndpoint, pinataAuthenticationEndpoint, pinataPinListEndpoint, pinataPinJobsEndpoint].includes(endpoint)) {
		return {endpoint, config, dispose: () => null};
	}
	const url = validateCustomPinProviderUrl(endpoint, options);
	let agent;
	try {
		agent = await createSafeHttpsAgent(url.hostname, {
			lookup: options.lookup || dnsLookup,
			errorPrefix: 'pin_provider_endpoint'
		});
	} catch (error) {
		if (error?.message === 'pin_provider_endpoint_address_not_allowed') {
			throw getTerminalProviderPolicyError(error.message);
		}
		throw error;
	}
	config.httpsAgent = agent;
	return {
		endpoint,
		config,
		dispose: () => agent.destroy()
	};
}

export function normalizePinProviderError(error, sensitiveValues: unknown[] = []): Error & {
	status?: number;
	details?: string;
	retryable: boolean;
} {
	if (error?.retryable === false && String(error?.message || '').startsWith('pin_provider_')) {
		return error;
	}
	const normalizedError = new Error("pinata_pin_failed") as Error & {
		status?: number;
		details?: string;
		retryable: boolean;
	};
	normalizedError.status = getHttpStatus(error);
	normalizedError.details = getBoundedErrorDetails(error?.response?.data ?? error?.message, sensitiveValues);
	normalizedError.retryable = isRetryablePinProviderError(error, normalizedError.status);
	return normalizedError;
}

export function getPinProviderOptionsFromEnvironment(): IPinProviderRequestOptions {
	return {
		requestTimeoutMs: process.env.PIN_PROVIDER_REQUEST_TIMEOUT_MS,
		allowCustomEndpoints: process.env.PIN_ALLOW_CUSTOM_ENDPOINTS === '1',
		customEndpointHosts: String(process.env.PIN_CUSTOM_ENDPOINT_HOSTS || '')
			.split(',')
			.map(host => host.trim().toLowerCase())
			.filter(host => !!host)
	};
}

export function normalizePinProviderEndpoint(value: unknown): string {
	if (value === undefined || value === null || value === '') {
		return pinataEndpoint;
	}
	try {
		return new URL(String(value)).toString();
	} catch (error) {
		throw getTerminalProviderPolicyError('pin_provider_endpoint_invalid');
	}
}

function validateCustomPinProviderUrl(endpoint: string, options: IPinProviderRequestOptions): URL {
	if (!options.allowCustomEndpoints) {
		throw getTerminalProviderPolicyError('pin_provider_custom_endpoint_disabled');
	}
	const url = new URL(endpoint);
	if (url.protocol !== 'https:') {
		throw getTerminalProviderPolicyError('pin_provider_endpoint_https_required');
	}
	if (url.username || url.password) {
		throw getTerminalProviderPolicyError('pin_provider_endpoint_credentials_not_allowed');
	}
	const approvedHosts = new Set((options.customEndpointHosts || []).map(host => host.toLowerCase()));
	if (!approvedHosts.has(url.host.toLowerCase())) {
		throw getTerminalProviderPolicyError('pin_provider_endpoint_host_not_allowed');
	}
	return url;
}

function getPinProviderRequestTimeoutMs(value: unknown): number {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (!Number.isFinite(parsed)) {
		return defaultRequestTimeoutMs;
	}
	return Math.min(Math.max(parsed, minRequestTimeoutMs), maxRequestTimeoutMs);
}

function getTerminalProviderPolicyError(message: string) {
	const error = new Error(message) as Error & {retryable: boolean};
	error.retryable = false;
	return error;
}

function getHttpStatus(error): number | undefined {
	const status = Number(error?.response?.status);
	return Number.isFinite(status) ? status : undefined;
}

function isRetryablePinProviderError(error, status?: number): boolean {
	if (status) {
		return status === 408 || status === 425 || status === 429 || status >= 500;
	}
	return error?.code !== 'ERR_BAD_REQUEST';
}

function getBoundedErrorDetails(value, sensitiveValues: unknown[]): string {
	let details;
	try {
		details = typeof value === 'string' ? value : JSON.stringify(value);
	} catch (error) {
		details = 'pin_provider_error_details_unavailable';
	}
	details = String(details || 'pin_provider_request_failed');
	const redactedValues = sensitiveValues
		.map(sensitiveValue => String(sensitiveValue || ''))
		.filter(sensitiveValue => !!sensitiveValue)
		.flatMap(sensitiveValue => [
			sensitiveValue,
			JSON.stringify(sensitiveValue).slice(1, -1)
		]);
	new Set(redactedValues).forEach(sensitiveValue => {
		details = details.split(sensitiveValue).join('[redacted]');
	});
	return details.slice(0, maxErrorDetailsLength);
}
