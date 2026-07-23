import assert from 'node:assert';
import {EventEmitter} from 'node:events';
import {
	recordRuntimeSnapshot,
	startMemoryProfiler,
	stopMemoryProfiler,
	trackRuntimeHttpRequest
} from '../app/memoryProfiler.js';

describe('runtime profiler', () => {
	const originalRuntimeLogFile = process.env.GEESOME_RUNTIME_LOG_FILE;
	const originalRuntimeInterval = process.env.GEESOME_RUNTIME_LOG_INTERVAL_SEC;
	const originalRuntimeProfile = process.env.GEESOME_RUNTIME_PROFILE;
	const originalDebug = process.env.DEBUG;

	afterEach(async () => {
		await stopMemoryProfiler();
		setOptionalEnv('GEESOME_RUNTIME_LOG_FILE', originalRuntimeLogFile);
		setOptionalEnv('GEESOME_RUNTIME_LOG_INTERVAL_SEC', originalRuntimeInterval);
		setOptionalEnv('GEESOME_RUNTIME_PROFILE', originalRuntimeProfile);
		setOptionalEnv('DEBUG', originalDebug);
	});

	it('does not attach request listeners while profiling is disabled', () => {
		stopMemoryProfiler();
		delete process.env.GEESOME_RUNTIME_LOG_FILE;
		delete process.env.GEESOME_RUNTIME_PROFILE;
		const response: any = new EventEmitter();
		trackRuntimeHttpRequest('api', {method: 'GET'}, response);

		assert.equal(response.listenerCount('finish'), 0);
		assert.equal(response.listenerCount('close'), 0);
		assert.equal(recordRuntimeSnapshot('disabled'), null);
	});

	it('does not enable request tracking from a broad debug wildcard', () => {
		process.env.DEBUG = 'geesome*';
		delete process.env.GEESOME_RUNTIME_LOG_FILE;
		delete process.env.GEESOME_RUNTIME_PROFILE;
		stopMemoryProfiler();
		startMemoryProfiler();

		const response: any = new EventEmitter();
		trackRuntimeHttpRequest('api', {method: 'GET'}, response);
		assert.equal(response.listenerCount('finish'), 0);
		assert.equal(recordRuntimeSnapshot('wildcard'), null);
	});

	it('records bounded process, event-loop, and request interval diagnostics', () => {
		process.env.GEESOME_RUNTIME_LOG_FILE = '/tmp/geesome-runtime-profiler-test.jsonl';
		process.env.GEESOME_RUNTIME_LOG_INTERVAL_SEC = '3600';
		startMemoryProfiler();

		const response: any = new EventEmitter();
		response.statusCode = 201;
		response.writableEnded = true;
		trackRuntimeHttpRequest('api', {method: 'post'}, response);
		response.emit('finish');

		const snapshot: any = recordRuntimeSnapshot('unit-test');
		assert.equal(snapshot.label, 'unit-test');
		assert.equal(typeof snapshot.processCpuPercent, 'number');
		assert.equal(typeof snapshot.eventLoop.utilization, 'number');
		assert.equal(snapshot.requests.api.started, 1);
		assert.equal(snapshot.requests.api.completed, 1);
		assert.equal(snapshot.requests.api.aborted, 0);
		assert.equal(snapshot.requests.api.inFlight, 0);
		assert.equal(snapshot.requests.api.methods.POST, 1);
		assert.equal(snapshot.requests.api.statusClasses['2xx'], 1);

		const nextSnapshot: any = recordRuntimeSnapshot('next-interval');
		assert.equal(nextSnapshot.requests.api.started, 0);
		assert.equal(nextSnapshot.requests.api.completed, 0);
	});

	it('records closed unfinished responses as aborted once', () => {
		process.env.GEESOME_RUNTIME_LOG_FILE = '/tmp/geesome-runtime-profiler-test.jsonl';
		process.env.GEESOME_RUNTIME_LOG_INTERVAL_SEC = '3600';
		startMemoryProfiler();

		const response: any = new EventEmitter();
		response.statusCode = 200;
		response.writableEnded = false;
		trackRuntimeHttpRequest('gateway', {method: 'get'}, response);
		response.emit('close');
		response.emit('finish');

		const snapshot: any = recordRuntimeSnapshot('aborted');
		assert.equal(snapshot.requests.gateway.completed, 0);
		assert.equal(snapshot.requests.gateway.aborted, 1);
		assert.equal(snapshot.requests.gateway.inFlight, 0);
	});

	it('keeps shared profiling active until every app owner stops', async () => {
		process.env.GEESOME_RUNTIME_LOG_FILE = '/tmp/geesome-runtime-profiler-test.jsonl';
		process.env.GEESOME_RUNTIME_LOG_INTERVAL_SEC = '3600';
		const firstOwner = startMemoryProfiler();
		const secondOwner = startMemoryProfiler();

		await firstOwner.stop();
		assert.notEqual(recordRuntimeSnapshot('second-owner-active'), null);

		await firstOwner.stop();
		await secondOwner.stop();
		assert.equal(recordRuntimeSnapshot('all-owners-stopped'), null);
	});
});

function setOptionalEnv(name: string, value: string | undefined): void {
	if (typeof value === 'undefined') {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
}
