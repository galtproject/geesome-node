import axios from "axios";
import {lookup as dnsLookup} from "node:dns/promises";
import {Agent as HttpsAgent} from "node:https";
import {BlockList, isIP} from "node:net";

export const pinataEndpoint = "https://api.pinata.cloud/pinning/pinByHash";

const defaultRequestTimeoutMs = 30000;
const minRequestTimeoutMs = 1000;
const maxRequestTimeoutMs = 120000;
const maxErrorDetailsLength = 1000;
const maxResponseLength = 64 * 1024;
const blockedProviderAddresses = getBlockedProviderAddresses();

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
	if (endpoint === pinataEndpoint) {
		return {endpoint, config, dispose: () => null};
	}
	const url = validateCustomPinProviderUrl(endpoint, options);
	const approvedAddresses = await resolveApprovedAddresses(url.hostname, options.lookup || dnsLookup);
	const agent = new HttpsAgent({
		lookup: getPinnedLookup(url.hostname, approvedAddresses)
	});
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

function normalizePinProviderEndpoint(value: unknown): string {
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

async function resolveApprovedAddresses(hostname: string, lookup: typeof dnsLookup) {
	let addresses;
	try {
		addresses = await lookup(stripIpv6Brackets(hostname), {all: true, verbatim: true});
	} catch (error) {
		throw new Error('pin_provider_endpoint_dns_failed');
	}
	if (!addresses.length) {
		throw new Error('pin_provider_endpoint_dns_failed');
	}
	if (addresses.some(({address}) => !isPublicIpAddress(address))) {
		throw getTerminalProviderPolicyError('pin_provider_endpoint_address_not_allowed');
	}
	return addresses;
}

function getPinnedLookup(hostname: string, addresses) {
	let nextAddress = 0;
	return (requestedHostname, options, callback) => {
		if (stripIpv6Brackets(requestedHostname).toLowerCase() !== stripIpv6Brackets(hostname).toLowerCase()) {
			callback(new Error('pin_provider_endpoint_host_changed'));
			return;
		}
		const family = typeof options === 'object' ? options.family : 0;
		const matchingAddresses = family ? addresses.filter(address => address.family === family) : addresses;
		if (!matchingAddresses.length) {
			callback(new Error('pin_provider_endpoint_address_family_unavailable'));
			return;
		}
		if (typeof options === 'object' && options.all) {
			callback(null, matchingAddresses);
			return;
		}
		const selectedAddress = matchingAddresses[nextAddress % matchingAddresses.length];
		nextAddress += 1;
		callback(null, selectedAddress.address, selectedAddress.family);
	};
}

function isPublicIpAddress(address: string): boolean {
	const family = isIP(address);
	if (!family) {
		return false;
	}
	if (blockedProviderAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6')) {
		return false;
	}
	return family === 4 || isGlobalIpv6Address(address.toLowerCase());
}

function isGlobalIpv6Address(address: string): boolean {
	const firstGroup = Number.parseInt(address.split(':')[0], 16);
	return firstGroup >= 0x2000 && firstGroup <= 0x3fff;
}

function getBlockedProviderAddresses(): BlockList {
	const blockList = new BlockList();
	[
		['0.0.0.0', 8],
		['10.0.0.0', 8],
		['100.64.0.0', 10],
		['127.0.0.0', 8],
		['169.254.0.0', 16],
		['172.16.0.0', 12],
		['192.0.0.0', 24],
		['192.0.2.0', 24],
		['192.88.99.0', 24],
		['192.168.0.0', 16],
		['198.18.0.0', 15],
		['198.51.100.0', 24],
		['203.0.113.0', 24],
		['224.0.0.0', 4],
		['240.0.0.0', 4]
	].forEach(([address, prefix]) => blockList.addSubnet(String(address), Number(prefix), 'ipv4'));
	[
		['::', 128],
		['::1', 128],
		['64:ff9b:1::', 48],
		['100::', 64],
		['2001::', 23],
		['2002::', 16],
		['fc00::', 7],
		['fe80::', 10],
		['ff00::', 8]
	].forEach(([address, prefix]) => blockList.addSubnet(String(address), Number(prefix), 'ipv6'));
	return blockList;
}

function stripIpv6Brackets(hostname: string): string {
	return hostname.replace(/^\[|\]$/g, '');
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
