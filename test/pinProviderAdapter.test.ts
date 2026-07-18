import assert from 'node:assert';
import axios from 'axios';
import {createPinProviderInspector} from '../app/modules/pin/providerAdapter.js';
import {PinStorageObjectStatus} from '../app/modules/pin/stateHelpers.js';

describe('pin provider adapter', function () {
	let originalAxiosGet;

	beforeEach(() => {
		originalAxiosGet = axios.get;
	});

	afterEach(() => {
		axios.get = originalAxiosGet;
	});

	it('confirms a CID present in the Pinata pinned list', async () => {
		const requests = [];
		axios.get = async (url, config) => {
			requests.push({url, config});
			return {data: {rows: [{id: 'remote-id', ipfs_pin_hash: 'storage-id'}]}};
		};
		const inspect = createPinProviderInspector();

		const result = await inspect(getAccount(), 'storage-id', new AbortController().signal);

		assert.equal(result.status, PinStorageObjectStatus.Confirmed);
		assert.equal(result.remoteId, 'remote-id');
		assert.equal(requests.length, 1);
		assert.equal(requests[0].config.params.cid, 'storage-id');
		assert.equal(requests[0].config.params.status, 'pinned');
	});

	it('keeps an active Pinata retrieval in accepted state', async () => {
		axios.get = async (url) => url.includes('/pinList')
			? {data: {rows: []}}
			: {data: {rows: [{id: 'job-id', status: 'retrieving'}]}};
		const inspect = createPinProviderInspector();

		const result = await inspect(getAccount(), 'storage-id', new AbortController().signal);

		assert.equal(result.status, PinStorageObjectStatus.Accepted);
		assert.equal(result.remoteId, 'job-id');
	});

	it('classifies terminal Pinata jobs without treating them as missing', async () => {
		axios.get = async (url) => url.includes('/pinList')
			? {data: {rows: []}}
			: {data: {rows: [{id: 'job-id', status: 'over_max_size'}]}};
		const inspect = createPinProviderInspector();

		const result = await inspect(getAccount(), 'storage-id', new AbortController().signal);

		assert.equal(result.status, PinStorageObjectStatus.TerminalFailure);
		assert.equal(result.error?.message, 'pinata_pin_job_over_max_size');
	});

	it('marks a CID missing only when neither pinned files nor jobs contain it', async () => {
		axios.get = async () => ({data: {rows: []}});
		const inspect = createPinProviderInspector();

		const result = await inspect(getAccount(), 'storage-id', new AbortController().signal);

		assert.equal(result.status, PinStorageObjectStatus.Missing);
	});

	it('normalizes retryable provider failures and redacts credentials', async () => {
		axios.get = async () => {
			const error: any = new Error('secret-value request failed');
			error.response = {status: 503, data: {message: 'secret-value unavailable'}};
			throw error;
		};
		const inspect = createPinProviderInspector();

		await assert.rejects(
			() => inspect(getAccount(), 'storage-id', new AbortController().signal),
			(error: any) => {
				assert.equal(error.message, 'pinata_pin_failed');
				assert.equal(error.retryable, true);
				assert.equal(error.details.includes('secret-value'), false);
				return true;
			}
		);
	});

	it('fails closed for custom endpoints without a status adapter', async () => {
		const inspect = createPinProviderInspector({
			allowCustomEndpoints: true,
			customEndpointHosts: ['pin.example.test']
		});

		await assert.rejects(
			() => inspect({...getAccount(), endpoint: 'https://pin.example.test/pinning/pinByHash'}, 'storage-id', new AbortController().signal),
			(error: any) => error.retryable === true && error.message.includes('reconciliation_unsupported')
		);
	});
});

function getAccount() {
	return {
		id: 1,
		service: 'pinata',
		apiKey: 'pinata-key',
		secretApiKey: 'secret-value'
	};
}
