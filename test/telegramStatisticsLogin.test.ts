import assert from 'node:assert/strict';
import {createTelegramLoginFlow} from '../app/modules/telegramClient/loginFlow.js';

const credentials = {apiId: 12345, apiKey: 'a'.repeat(32), phoneNumber: '+351912345678'};
function fixture({twoFactor = false, now = () => Date.now()} = {}) {
	const calls = [], disconnected = [];
	const flow = createTelegramLoginFlow(async (userId, input, options) => {
		calls.push({userId, input, options});
		const client = {disconnect: async () => {disconnected.push(input.stage);}, session: {save: () => 'private-session'}};
		options.onClient(client);
		if (input.stage === 1) {
			assert.equal(options.transientSession, '');
			return {client, result: {response: {phoneCodeHash: 'private-hash'}, sessionKey: 'private-session'}};
		}
		assert.equal(options.transientSession, 'private-session');
		if (input.stage === 2 && twoFactor) {
			return {client, error: 'SESSION_PASSWORD_NEEDED', result: {sessionKey: 'private-session'}};
		}
		if (input.phoneCode === '00000' || input.password === 'bad') {
			throw new Error('provider secret details');
		}
		return {client, result: {sessionKey: 'private-session', account: {id: 7, userId, accountId: '777', apiId: 12345, username: 'fixture', sessionKey: 'private-session', apiKey: credentials.apiKey}}};
	}, {now});
	return {flow, calls, disconnected};
}
describe('Telegram statistics login challenge', () => {
	it('requests a code and consumes an owner/key-bound challenge without exposing secrets', async () => {
		const {flow, calls, disconnected} = fixture();
		const challenge = await flow.start(1, 'key:1', credentials);
		assert.equal(challenge.stage, 'code');
		assert.doesNotMatch(JSON.stringify(challenge), /private|phoneCodeHash|apiKey|session/);
		await assert.rejects(flow.complete(2, 'key:1', {challengeId: challenge.challengeId, code: '12345'}), /expired/);
		await assert.rejects(flow.complete(1, 'key:2', {challengeId: challenge.challengeId, code: '12345'}), /expired/);
		const result = await flow.complete(1, 'key:1', {challengeId: challenge.challengeId, code: '12345'});
		assert.deepEqual(result, {stage: 'connected', account: {id: 7, label: '@fixture', ready: true}});
		assert.equal(calls[1].input.phoneCodeHash, 'private-hash');
		assert.deepEqual(disconnected, [1, 2]);
		await assert.rejects(flow.complete(1, 'key:1', {challengeId: challenge.challengeId, code: '12345'}), /expired/);
	});
	it('continues 2FA with the pending session and no code replay', async () => {
		const {flow, calls} = fixture({twoFactor: true});
		const challenge = await flow.start(1, 'key:1', credentials);
		assert.equal((await flow.complete(1, 'key:1', {challengeId: challenge.challengeId, code: '12345'})).stage, 'password');
		await assert.rejects(flow.complete(1, 'key:1', {challengeId: challenge.challengeId, password: 'bad'}), /password_invalid/);
		const result = await flow.complete(1, 'key:1', {challengeId: challenge.challengeId, password: 'private-password'});
		assert.equal(result.stage, 'connected');
		assert.equal(calls.at(-1).input.stage, 3);
		assert.equal(calls.at(-1).input.phoneCode, undefined);
		assert.doesNotMatch(JSON.stringify(result), /private|sessionKey|apiKey/);
	});
	it('expires, cancels and bounds correction attempts', async () => {
		let time = 0;
		const {flow, disconnected} = fixture({now: () => time});
		const first = await flow.start(1, 'key:1', credentials);
		time = 600001;
		await assert.rejects(flow.complete(1, 'key:1', {challengeId: first.challengeId, code: '12345'}), /expired/);
		const second = await flow.start(1, 'key:1', credentials);
		flow.cancel(1, 'key:2', second.challengeId);
		for (let i = 0; i < 5; i++) {
			await assert.rejects(flow.complete(1, 'key:1', {challengeId: second.challengeId, code: '00000'}), /code_invalid/);
		}
		await assert.rejects(flow.complete(1, 'key:1', {challengeId: second.challengeId, code: '12345'}), /expired/);
		assert.equal(disconnected.length, 7);
		const third = await flow.start(1, 'key:1', credentials);
		flow.cancel(1, 'key:1', third.challengeId);
		await assert.rejects(flow.complete(1, 'key:1', {challengeId: third.challengeId, code: '12345'}), /expired/);
	});
	it('limits pending requests and rejects secret/session injection', async () => {
		const {flow} = fixture();
		await assert.rejects(flow.start(1, 'key:1', {...credentials, sessionKey: 'injected'}), /input_invalid/);
		for (let i = 0; i < 3; i++) {
			await flow.start(1, 'key:1', credentials);
		}
		await assert.rejects(flow.start(1, 'key:1', credentials), /login_limit/);
	});
	it('rejects concurrent continuation and always disconnects on provider failure', async () => {
		let resolve;
		const gate = new Promise(r => {resolve = r;});
		let disconnected = 0;
		const flow = createTelegramLoginFlow(async (userId, input, options) => {
			const client = {session: {save: () => 'private'}, disconnect: async () => {disconnected++;}};
			options.onClient(client);
			if (input.stage === 1) {
				return {client, result: {response: {phoneCodeHash: 'hash'}, sessionKey: 'private'}};
			}
			await gate;
			throw new Error('provider details');
		});
		const challenge = await flow.start(1, 'key:1', credentials);
		const first = flow.complete(1, 'key:1', {challengeId: challenge.challengeId, code: '12345'});
		await assert.rejects(flow.complete(1, 'key:1', {challengeId: challenge.challengeId, code: '12345'}), /busy/);
		resolve();
		await assert.rejects(first, /code_invalid/);
		assert.equal(disconnected, 2);
	});
});
