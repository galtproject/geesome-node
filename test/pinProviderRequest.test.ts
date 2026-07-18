import assert from "assert";
import {
	normalizePinProviderError,
	pinataEndpoint,
	pinataPinJobsEndpoint,
	pinataPinListEndpoint,
	preparePinProviderRequest
} from "../app/modules/pin/providerRequest.js";

describe("pin provider request policy", function () {
	it("keeps the canonical Pinata endpoint bounded without DNS policy", async () => {
		const controller = new AbortController();
		const prepared = await preparePinProviderRequest(undefined, controller.signal, {
			requestTimeoutMs: 500000
		});

		assert.equal(prepared.endpoint, pinataEndpoint);
		assert.equal(prepared.config.timeout, 120000);
		assert.equal(prepared.config.maxRedirects, 0);
		assert.equal(prepared.config.signal, controller.signal);
		assert.equal(prepared.config.httpsAgent, undefined);
		prepared.dispose();
	});

	it("keeps canonical Pinata reconciliation endpoints under the same request policy", async () => {
		const signal = new AbortController().signal;
		for (const endpoint of [pinataPinListEndpoint, pinataPinJobsEndpoint]) {
			const prepared = await preparePinProviderRequest(endpoint, signal);
			assert.equal(prepared.endpoint, endpoint);
			assert.equal(prepared.config.maxRedirects, 0);
			assert.equal(prepared.config.httpsAgent, undefined);
			prepared.dispose();
		}
	});

	it("requires explicit HTTPS custom endpoint approval", async () => {
		const signal = new AbortController().signal;
		await assert.rejects(
			() => preparePinProviderRequest("https://pins.example.test/pin", signal),
			isTerminalPolicyError('pin_provider_custom_endpoint_disabled')
		);
		await assert.rejects(
			() => preparePinProviderRequest("http://pins.example.test/pin", signal, {
				allowCustomEndpoints: true,
				customEndpointHosts: ['pins.example.test']
			}),
			isTerminalPolicyError('pin_provider_endpoint_https_required')
		);
		await assert.rejects(
			() => preparePinProviderRequest("https://other.example.test/pin", signal, {
				allowCustomEndpoints: true,
				customEndpointHosts: ['pins.example.test']
			}),
			isTerminalPolicyError('pin_provider_endpoint_host_not_allowed')
		);
	});

	it("rejects private or mixed DNS answers before credentials can be sent", async () => {
		const signal = new AbortController().signal;
		for (const addresses of [
			[{address: '127.0.0.1', family: 4}],
			[{address: '::1', family: 6}],
			[{address: '8.8.8.8', family: 4}, {address: '10.0.0.1', family: 4}],
			[{address: '::ffff:127.0.0.1', family: 6}]
		]) {
			await assert.rejects(
				() => preparePinProviderRequest("https://pins.example.test/pin", signal, {
					allowCustomEndpoints: true,
					customEndpointHosts: ['pins.example.test'],
					lookup: (async () => addresses) as any
				}),
				isTerminalPolicyError('pin_provider_endpoint_address_not_allowed')
			);
		}
	});

	it("pins approved DNS answers into a no-redirect HTTPS agent", async () => {
		const prepared = await preparePinProviderRequest(
			"https://pins.example.test/pin",
			new AbortController().signal,
			{
				allowCustomEndpoints: true,
				customEndpointHosts: ['pins.example.test'],
				lookup: (async () => [{address: '8.8.8.8', family: 4}]) as any,
				requestTimeoutMs: 500
			}
		);

		assert.equal(prepared.config.timeout, 1000);
		assert.equal(prepared.config.maxRedirects, 0);
		assert.ok(prepared.config.httpsAgent);
		prepared.dispose();
	});

	it("classifies bounded provider errors for retry handling", () => {
		const rateLimited = normalizePinProviderError({
			response: {status: 429, data: {message: 'x'.repeat(2000)}}
		});
		assert.equal(rateLimited.retryable, true);
		assert.equal(rateLimited.details.length, 1000);

		const unauthorized = normalizePinProviderError({
			response: {status: 401, data: {message: 'tiny and secret\"value were rejected'}}
		}, ['tiny', 'secret"value']);
		assert.equal(unauthorized.retryable, false);
		assert.equal(unauthorized.status, 401);
		assert.equal(unauthorized.details.includes('tiny'), false);
		assert.equal(unauthorized.details.includes('secret'), false);
		assert.equal(unauthorized.details.includes('[redacted]'), true);
	});
});

function isTerminalPolicyError(message: string) {
	return (error: any) => error.message === message && error.retryable === false;
}
