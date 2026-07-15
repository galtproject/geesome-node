import assert from 'node:assert';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {closeHttpServer} from '../app/httpServer.js';
import {getModuleStopOrder} from '../app/index.js';
import {getProcessShutdownTimeoutMs, registerProcessShutdown} from '../app/processShutdown.js';

describe('process shutdown', () => {
	it('stops the app once and exits cleanly after graceful shutdown', async () => {
		const processTarget = new ProcessTarget();
		let stopCalls = 0;
		const controller = registerProcessShutdown({
			async stop() {
				stopCalls++;
			}
		} as any, {processTarget, timeoutMs: 100});

		processTarget.emit('SIGTERM');
		await processTarget.waitForExit();
		await controller.shutdown('SIGTERM');

		assert.equal(stopCalls, 1);
		assert.deepEqual(processTarget.exitCodes, [0]);
		assert.equal(processTarget.listenerCount('SIGTERM'), 0);
		assert.equal(processTarget.listenerCount('SIGINT'), 0);
	});

	it('exits with an error when graceful shutdown exceeds its deadline', async () => {
		const processTarget = new ProcessTarget();
		const errors = [];
		registerProcessShutdown({
			stop: () => new Promise(() => undefined)
		} as any, {
			processTarget,
			timeoutMs: 5,
			logger: {error: (...args) => errors.push(args)}
		});

		processTarget.emit('SIGINT');
		await processTarget.waitForExit();

		assert.deepEqual(processTarget.exitCodes, [1]);
		assert.equal(errors.length, 1);
		assert.match(errors[0][1].message, /shutdown_timeout:5/);
	});

	it('forces the conventional signal exit code on a repeated signal', async () => {
		const processTarget = new ProcessTarget();
		let finishStop;
		const stopFinished = new Promise<void>(resolve => {
			finishStop = resolve;
		});
		const controller = registerProcessShutdown({
			stop: () => stopFinished
		} as any, {processTarget, timeoutMs: 100});

		processTarget.emit('SIGTERM');
		processTarget.emit('SIGINT');
		await processTarget.waitForExit();

		assert.deepEqual(processTarget.exitCodes, [130]);
		finishStop();
		await controller.shutdown('SIGTERM');
	});

	it('awaits active HTTP requests and remains idempotent', async () => {
		let finishRequest;
		let markRequestStarted;
		const requestFinished = new Promise<void>(resolve => {
			finishRequest = resolve;
		});
		const requestStarted = new Promise<void>(resolve => {
			markRequestStarted = resolve;
		});
		const server = http.createServer(async (_req, res) => {
			markRequestStarted();
			await requestFinished;
			res.setHeader('Connection', 'close');
			res.end('ok');
		});
		await listen(server);
		const responsePromise = request(server);
		await requestStarted;

		let closeResolved = false;
		const firstClose = closeHttpServer(server).then(() => {
			closeResolved = true;
		});
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(closeResolved, false);

		finishRequest();
		assert.equal(await responsePromise, 'ok');
		await firstClose;
		await closeHttpServer(server);
		assert.equal(closeResolved, true);
	});

	it('uses a bounded default for invalid timeout configuration', () => {
		assert.equal(getProcessShutdownTimeoutMs('invalid'), 30000);
		assert.equal(getProcessShutdownTimeoutMs(0), 30000);
		assert.equal(getProcessShutdownTimeoutMs('2500'), 2500);
	});

	it('stops public ingress before workers and the database', () => {
		assert.deepEqual(
			getModuleStopOrder(['database', 'api', 'group', 'storageSpace', 'gateway']),
			['gateway', 'api', 'storageSpace', 'group', 'database']
		);
	});

	it('drains an active request after a real SIGTERM', async () => {
		const child = spawn(process.execPath, [
			'--import',
			'tsx',
			'test/fixtures/processShutdownChild.ts'
		], {cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe']});
		const output = collectChildOutput(child);
		try {
			const readyLine = await output.waitForLine(/^READY:/);
			const port = Number(readyLine.split(':')[1]);
			const responsePromise = requestPort(port);
			await output.waitForLine(/^REQUEST_STARTED$/);
			child.kill('SIGTERM');

			assert.equal(await responsePromise, 'ok');
			const result = await waitForChildExit(child);
			assert.deepEqual(result, {code: 0, signal: null});
			assert.equal(output.stderr(), '');
		} finally {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill('SIGKILL');
			}
		}
	});
});

class ProcessTarget extends EventEmitter {
	exitCodes: number[] = [];
	exitPromise: Promise<void>;
	resolveExit;

	constructor() {
		super();
		this.exitPromise = new Promise(resolve => {
			this.resolveExit = resolve;
		});
	}

	exit(code: number) {
		if (this.exitCodes.length) {
			return;
		}
		this.exitCodes.push(code);
		this.resolveExit();
	}

	waitForExit() {
		return this.exitPromise;
	}
}

function listen(server: http.Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});
}

function request(server: http.Server): Promise<string> {
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('http_server_address_unavailable');
	}
	return new Promise((resolve, reject) => {
		const req = http.get({host: '127.0.0.1', port: address.port}, res => {
			const chunks = [];
			res.on('data', chunk => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks).toString()));
		});
		req.on('error', reject);
	});
}

function requestPort(port: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = http.get({host: '127.0.0.1', port}, res => {
			const chunks = [];
			res.on('data', chunk => chunks.push(chunk));
			res.on('end', () => resolve(Buffer.concat(chunks).toString()));
		});
		req.on('error', reject);
	});
}

function collectChildOutput(child) {
	let stdout = '';
	let stderr = '';
	const lineWaiters = [];
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', chunk => {
		stdout += chunk;
		for (const waiter of [...lineWaiters]) {
			const line = stdout.split(/\r?\n/).find(outputLine => waiter.pattern.test(outputLine));
			if (line) {
				lineWaiters.splice(lineWaiters.indexOf(waiter), 1);
				waiter.resolve(line);
			}
		}
	});
	child.stderr.on('data', chunk => {
		stderr += chunk;
	});
	return {
		waitForLine(pattern: RegExp) {
			const line = stdout.split(/\r?\n/).find(outputLine => pattern.test(outputLine));
			if (line) {
				return Promise.resolve(line);
			}
			return new Promise((resolve, reject) => {
				lineWaiters.push({pattern, resolve});
				child.once('exit', (code, signal) => reject(new Error(`child_exited_before_output:${code}:${signal}`)));
			});
		},
		stderr: () => stderr
	};
}

function waitForChildExit(child): Promise<{code: number | null, signal: NodeJS.Signals | null}> {
	return new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve({code, signal}));
	});
}
