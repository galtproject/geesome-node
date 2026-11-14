import assert from 'node:assert/strict';
import {Agent as HttpAgent} from 'node:http';
import {Agent as HttpsAgent} from 'node:https';
import {createSafeHttpAndHttpsAgents} from '../app/helpers/safeHttpsAgent.js';

describe('safe HTTP and HTTPS agents', () => {
	for (const address of [
		'0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
		'172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '240.0.0.1',
		'::', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1', '2002:7f00:1::'
	]) {
		it(`rejects non-public address ${address}`, async () => {
			await assert.rejects(
				createSafeHttpAndHttpsAgents('download.example', {
					errorPrefix: 'save_by_url',
					lookup: (async () => [{address, family: address.includes(':') ? 6 : 4}]) as any
				}),
				{message: 'save_by_url_address_not_allowed'}
			);
		});
	}

	for (const privateAddress of [
		{address: '127.0.0.1', family: 4},
		{address: '::1', family: 6}
	]) {
		it(`rejects mixed public/private DNS answers containing ${privateAddress.address}`, async () => {
			await assert.rejects(
				createSafeHttpAndHttpsAgents('download.example', {
					lookup: (async () => [{address: '8.8.8.8', family: 4}, privateAddress]) as any
				}),
				{message: 'outbound_http_address_not_allowed'}
			);
		});
	}

	it('normalizes failed and empty DNS lookups', async () => {
		for (const lookup of [
			async () => [],
			async () => { throw new Error('resolver unavailable'); }
		]) {
			await assert.rejects(
				createSafeHttpAndHttpsAgents('download.example', {lookup: lookup as any, errorPrefix: 'save_by_url'}),
				{message: 'save_by_url_dns_failed'}
			);
		}
	});

	it('pins both agents to the original answers even if a subsequent resolution would be private', async () => {
		const addresses = [
			{address: '8.8.8.8', family: 4},
			{address: '2606:4700:4700::1111', family: 6}
		];
		const lookups = [];
		const agents = await createSafeHttpAndHttpsAgents('download.example', {
			lookup: (async (hostname, options) => {
				lookups.push({hostname, options});
				return lookups.length === 1 ? addresses : [{address: '127.0.0.1', family: 4}];
			}) as any
		});
		try {
			assert.ok(agents.httpAgent instanceof HttpAgent);
			assert.ok(agents.httpsAgent instanceof HttpsAgent);
			for (const agent of [agents.httpAgent, agents.httpsAgent]) {
				assert.deepEqual(await pinnedLookup(agent, 'DOWNLOAD.EXAMPLE', {all: true}), addresses);
				assert.equal(await pinnedLookup(agent, 'download.example', {family: 4}), '8.8.8.8');
				assert.equal(await pinnedLookup(agent, 'download.example', {family: 6}), '2606:4700:4700::1111');
				await assert.rejects(pinnedLookup(agent, 'other.example', {}), {message: 'outbound_http_host_changed'});
			}
			assert.deepEqual(lookups, [{hostname: 'download.example', options: {all: true, verbatim: true}}]);
		} finally {
			agents.httpAgent.destroy();
			agents.httpsAgent.destroy();
		}
	});

	it('fails closed when the requested address family was not vetted', async () => {
		const agents = await createSafeHttpAndHttpsAgents('download.example', {
			lookup: (async () => [{address: '8.8.8.8', family: 4}]) as any
		});
		try {
			for (const agent of [agents.httpAgent, agents.httpsAgent]) {
				await assert.rejects(pinnedLookup(agent, 'download.example', {family: 6}), {
					message: 'outbound_http_address_family_unavailable'
				});
			}
		} finally {
			agents.httpAgent.destroy();
			agents.httpsAgent.destroy();
		}
	});
});

function pinnedLookup(agent: HttpAgent | HttpsAgent, hostname: string, options: any): Promise<any> {
	return new Promise((resolve, reject) => {
		agent.options.lookup(hostname, options, (error, address) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(address);
		});
	});
}
