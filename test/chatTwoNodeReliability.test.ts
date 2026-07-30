import assert from 'node:assert';
import {spawn, ChildProcess} from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {Client} from 'pg';
import browserE2eeHelper from 'geesome-libs/src/browserE2eeHelper.js';

const requiredModules = [
	'drivers',
	'database',
	'api',
	'accountStorage',
	'communicator',
	'storage',
	'content',
	'staticId',
	'asyncOperation',
	'group',
	'chat',
	'entityJsonManifest'
].join(',');

describe('two-node chat reliability', function () {
	this.timeout(120000);

	let nodeA: ChatNodeProcess | null;
	let nodeB: ChatNodeProcess | null;
	let databaseA: string;
	let databaseB: string;
	let dataDirA: string;
	let dataDirB: string;
	let portA: number;
	let portB: number;

	beforeEach(async () => {
		const suffix = `${process.pid}_${Date.now()}`;
		databaseA = `geesome_chat_a_${suffix}`;
		databaseB = `geesome_chat_b_${suffix}`;
		dataDirA = path.join(os.tmpdir(), databaseA);
		dataDirB = path.join(os.tmpdir(), databaseB);
		[portA, portB] = await Promise.all([findFreePort(), findFreePort()]);
		await createTestDatabase(databaseA);
		await createTestDatabase(databaseB);
		nodeA = await ChatNodeProcess.start(createNodeConfig(databaseA, dataDirA, portA));
		nodeB = await ChatNodeProcess.start(createNodeConfig(databaseB, dataDirB, portB));
	});

	afterEach(async () => {
		await Promise.allSettled([nodeA?.stop(), nodeB?.stop()]);
		await Promise.allSettled([
			dropTestDatabase(databaseA),
			dropTestDatabase(databaseB)
		]);
		await Promise.allSettled([
			fs.rm(dataDirA, {recursive: true, force: true}),
			fs.rm(dataDirB, {recursive: true, force: true})
		]);
	});

	it('delivers one queued event after both independent nodes restart', async () => {
		const aliceSetup = await nodeA.request('setup', {
			user: {
				email: 'alice-two-node@example.com',
				name: 'alice_two_node',
				password: 'alice'
			}
		});
		const bobSetup = await nodeB.request('setup', {
			user: {
				email: 'bob-two-node@example.com',
				name: 'bob_two_node',
				password: 'bob'
			}
		});
		const alice = aliceSetup.user;
		const bob = bobSetup.user;
		const aliceDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: alice.storageAccountId,
			deviceId: 'alice-two-node-browser'
		});
		const bobDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: bob.storageAccountId,
			deviceId: 'bob-two-node-browser'
		});
		await nodeA.request('register-device', {
			userId: alice.id,
			publicBundle: aliceDevice.publicBundle
		});
		await nodeB.request('register-device', {
			userId: bob.id,
			publicBundle: bobDevice.publicBundle
		});
		const bobTransportPublicKey = await nodeB.request(
			'get-transport-public-key',
			{ownerId: bob.storageAccountId}
		);
		const envelope = await browserE2eeHelper.encryptEnvelope(
			'two-node restart message',
			[bobDevice.publicBundle],
			aliceDevice,
			{
				messageId: 'two-node-restart-message-1',
				conversationId: 'two-node-restart-conversation-1'
			}
		);
		await nodeA.request('accept-event', {
			userId: alice.id,
			envelope,
			options: {
				recipientEndpoints: [{
					ownerId: bob.storageAccountId,
					publicKey: bobTransportPublicKey,
					inboxUrl: `http://127.0.0.1:${portB}/v1/chat/inbox`
				}]
			}
		});

		await nodeB.stop();
		nodeB = null;
		const failed = await nodeA.request('process-deliveries');
		assert.deepEqual(failed, {
			processed: 1,
			delivered: 0,
			failed: 0,
			pending: 1
		});
		await nodeA.stop();
		nodeA = null;

		nodeB = await ChatNodeProcess.start(createNodeConfig(databaseB, dataDirB, portB));
		nodeA = await ChatNodeProcess.start(createNodeConfig(databaseA, dataDirA, portA));
		const delivered = await nodeA.request('process-deliveries', {
			options: {now: new Date(Date.now() + 6000).toISOString()}
		});
		assert.deepEqual(delivered, {
			processed: 1,
			delivered: 1,
			failed: 0,
			pending: 0
		});
		const deliveries = await nodeA.request('get-deliveries', {
			userId: alice.id,
			messageId: envelope.messageId
		});
		assert.equal(deliveries.length, 1);
		assert.equal(deliveries[0].state, 'delivered');
		assert.equal(deliveries[0].attempts, 2);
		const received = await nodeB.request('get-events', {
			userId: bob.id,
			conversationId: envelope.conversationId
		});
		assert.equal(received.total, 1);
		assert.equal(received.list[0].envelope.messageId, envelope.messageId);
		assert.equal(
			JSON.stringify(received.list[0]).includes('two-node restart message'),
			false
		);
	});

	it('repairs earlier events after receiving a later event first', async () => {
		const aliceSetup = await nodeA.request('setup', {
			user: {
				email: 'alice-repair@example.com',
				name: 'alice_repair',
				password: 'alice'
			}
		});
		const bobSetup = await nodeB.request('setup', {
			user: {
				email: 'bob-repair@example.com',
				name: 'bob_repair',
				password: 'bob'
			}
		});
		const alice = aliceSetup.user;
		const bob = bobSetup.user;
		const aliceDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: alice.storageAccountId,
			deviceId: 'alice-repair-browser'
		});
		const bobDevice = await browserE2eeHelper.generateDeviceKeys({
			ownerId: bob.storageAccountId,
			deviceId: 'bob-repair-browser'
		});
		await nodeA.request('register-device', {
			userId: alice.id,
			publicBundle: aliceDevice.publicBundle
		});
		await nodeB.request('register-device', {
			userId: bob.id,
			publicBundle: bobDevice.publicBundle
		});
		const conversationId = 'two-node-repair-conversation-1';
		const envelopes = [];
		for (let sequence = 1; sequence <= 3; sequence += 1) {
			envelopes.push(await browserE2eeHelper.encryptEnvelope(
				`two-node repair message ${sequence}`,
				[bobDevice.publicBundle],
				aliceDevice,
				{
					messageId: `two-node-repair-message-${sequence}`,
					conversationId
				}
			));
		}
		await nodeA.request('accept-event', {
			userId: alice.id,
			envelope: envelopes[0]
		});
		await nodeA.request('accept-event', {
			userId: alice.id,
			envelope: envelopes[1]
		});
		const bobTransportPublicKey = await nodeB.request(
			'get-transport-public-key',
			{ownerId: bob.storageAccountId}
		);
		await nodeA.request('accept-event', {
			userId: alice.id,
			envelope: envelopes[2],
			options: {
				recipientEndpoints: [{
					ownerId: bob.storageAccountId,
					publicKey: bobTransportPublicKey,
					inboxUrl: `http://127.0.0.1:${portB}/v1/chat/inbox`
				}]
			}
		});

		const delivered = await nodeA.request('process-deliveries');
		assert.deepEqual(delivered, {
			processed: 1,
			delivered: 1,
			failed: 0,
			pending: 0
		});
		const receivedOutOfOrder = await nodeB.request('get-events', {
			userId: bob.id,
			conversationId
		});
		assert.equal(receivedOutOfOrder.total, 1);
		assert.equal(
			receivedOutOfOrder.list[0].envelope.messageId,
			envelopes[2].messageId
		);
		assert.equal(receivedOutOfOrder.list[0].sourceSequence, '3');

		const aliceTransportPublicKey = await nodeA.request(
			'get-transport-public-key',
			{ownerId: alice.storageAccountId}
		);
		const reconciliation = await nodeB.request('reconcile-conversation', {
			userId: bob.id,
			conversationId,
			options: {
				sourceOwnerId: alice.storageAccountId,
				sourcePublicKey: aliceTransportPublicKey,
				syncUrl: `http://127.0.0.1:${portA}/v1/chat/sync`,
				limit: 2,
				maxPages: 2
			}
		});
		assert.equal(reconciliation.complete, true);
		assert.equal(reconciliation.imported, 2);
		assert.equal(reconciliation.replayed, 1);
		assert.equal(reconciliation.pages, 2);
		assert.equal(reconciliation.verifiedSourceSequence, '3');

		const receivedAfterRepair = await nodeB.request('get-events', {
			userId: bob.id,
			conversationId
		});
		assert.equal(receivedAfterRepair.total, 3);
		assert.deepEqual(
			receivedAfterRepair.list
				.map(event => event.envelope.messageId)
				.sort(),
			envelopes.map(envelope => envelope.messageId).sort()
		);
		assert.equal(
			JSON.stringify(receivedAfterRepair).includes('two-node repair message'),
			false
		);

		const repeatedReconciliation = await nodeB.request(
			'reconcile-conversation',
			{
				userId: bob.id,
				conversationId,
				options: {sourceOwnerId: alice.storageAccountId}
			}
		);
		assert.equal(repeatedReconciliation.complete, true);
		assert.equal(repeatedReconciliation.imported, 0);
		assert.equal(repeatedReconciliation.replayed, 0);
		assert.equal(repeatedReconciliation.verifiedSourceSequence, '3');
	});
});

type ChatNodeConfig = {
	databaseName: string;
	dataDir: string;
	port: number;
};

class ChatNodeProcess {
	child: ChildProcess;
	nextRequestId = 1;
	pending = new Map<number, {
		resolve(value): void;
		reject(error): void;
		timeout: NodeJS.Timeout;
	}>();
	readyPromise: Promise<void>;
	resolveReady;
	rejectReady;
	stdout = '';
	stderr = '';
	stopped = false;

	constructor(child: ChildProcess) {
		this.child = child;
		this.readyPromise = new Promise((resolve, reject) => {
			this.resolveReady = resolve;
			this.rejectReady = reject;
		});
		child.stdout?.setEncoding('utf8');
		child.stderr?.setEncoding('utf8');
		child.stdout?.on('data', chunk => {
			this.stdout += chunk;
		});
		child.stderr?.on('data', chunk => {
			this.stderr += chunk;
		});
		child.on('message', message => this.onMessage(message));
		child.on('exit', (code, signal) => this.onExit(code, signal));
	}

	static async start(config: ChatNodeConfig): Promise<ChatNodeProcess> {
		const child = spawn(process.execPath, [
			'--import',
			'tsx',
			'test/fixtures/chatNodeChild.ts'
		], {
			cwd: process.cwd(),
			env: {
				...process.env,
				DATABASE_NAME: config.databaseName,
				DATABASE_APPLICATION_NAME: `geesome-chat-test-${config.databaseName}`,
				DATA_DIR: config.dataDir,
				PORT: String(config.port),
				MODULES: requiredModules,
				STORAGE_MODULE: 'ipfs-http-client',
				CHAT_AUTO_PROCESS_DELIVERIES: '0',
				CHAT_DELIVERY_WORKER: '0',
				CHAT_RECONCILIATION_WORKER: '0',
				CHAT_ATTACHMENT_CLEANUP_WORKER: '0'
			},
			stdio: ['ignore', 'pipe', 'pipe', 'ipc']
		});
		const node = new ChatNodeProcess(child);
		try {
			await withTimeout(
				node.readyPromise,
				60000,
				() => node.createError('chat_node_startup_timeout')
			);
		} catch (error) {
			child.kill('SIGKILL');
			throw error;
		}
		return node;
	}

	request(command: string, payload: any = {}): Promise<any> {
		const id = this.nextRequestId++;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(this.createError(`chat_node_request_timeout:${command}`));
			}, 30000);
			this.pending.set(id, {resolve, reject, timeout});
			this.child.send({id, command, payload});
		});
	}

	async stop(): Promise<void> {
		if (this.stopped) {
			return;
		}
		this.stopped = true;
		if (this.child.exitCode === null && this.child.signalCode === null) {
			await this.request('stop');
			await waitForExit(this.child);
		}
	}

	onMessage(message: any) {
		if (message?.type === 'ready') {
			this.resolveReady();
			return;
		}
		if (message?.type === 'startup-error') {
			this.rejectReady(this.createError(message.error));
			return;
		}
		const request = this.pending.get(message?.id);
		if (!request) {
			return;
		}
		this.pending.delete(message.id);
		clearTimeout(request.timeout);
		if (message.error) {
			request.reject(this.createError(message.error));
			return;
		}
		request.resolve(message.result);
	}

	onExit(code, signal) {
		const error = this.createError(`child_exit:${code}:${signal || ''}`);
		this.rejectReady(error);
		for (const request of this.pending.values()) {
			clearTimeout(request.timeout);
			request.reject(error);
		}
		this.pending.clear();
	}

	createError(message: string): Error {
		return new Error([
			message,
			this.stdout && `stdout:\n${this.stdout}`,
			this.stderr && `stderr:\n${this.stderr}`
		].filter(Boolean).join('\n'));
	}
}

function createNodeConfig(
	databaseName: string,
	dataDir: string,
	port: number
): ChatNodeConfig {
	return {databaseName, dataDir, port};
}

async function createTestDatabase(databaseName: string): Promise<void> {
	const client = createDatabaseClient();
	await client.connect();
	try {
		await client.query(`CREATE DATABASE "${databaseName}"`);
	} finally {
		await client.end();
	}
}

async function dropTestDatabase(databaseName: string): Promise<void> {
	if (!databaseName) {
		return;
	}
	const client = createDatabaseClient();
	await client.connect();
	try {
		await client.query(
			'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
			[databaseName]
		);
		await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
	} finally {
		await client.end();
	}
}

function createDatabaseClient(): Client {
	return new Client({
		host: process.env.DATABASE_HOST || 'localhost',
		port: Number(process.env.DATABASE_PORT || 5432),
		user: process.env.DATABASE_USER || 'geesome',
		password: process.env.DATABASE_PASSWORD || 'geesome',
		database: process.env.DATABASE_NAME || 'geesome_node'
	});
}

function findFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('chat_test_port_unavailable'));
				return;
			}
			const port = address.port;
			server.close(() => resolve(port));
		});
	});
}

function waitForExit(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', () => resolve());
	});
}

function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	getError: () => Error
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(getError()), timeoutMs);
		promise.then(
			value => {
				clearTimeout(timeout);
				resolve(value);
			},
			error => {
				clearTimeout(timeout);
				reject(error);
			}
		);
	});
}
