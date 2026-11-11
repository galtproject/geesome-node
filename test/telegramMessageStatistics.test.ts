import assert from 'node:assert/strict';
import bigInt from 'big-integer';
import {Api} from 'telegram';
import {getModule} from '../app/modules/telegramClient/index.js';

describe('Telegram message statistics read', () => {
	function fixture(overrides: any = {}) {
		const calls = [];
		const channel = new Api.Channel({id: bigInt(123), accessHash: bigInt(1), title: 'Fixture', photo: new Api.ChatPhotoEmpty(), date: 0, broadcast: true} as any);
		const client: any = {account: {accountId: '777'}, getMe: async () => ({id: bigInt(777)}), getEntity: async () => channel,
			getMessages: async (_entity, options) => {calls.push(options);return [{id: 5, className: 'Message', views: 20, forwards: 3, replies: {replies: 0}, reactions: {results: [{count: 2}, {count: 4}]}}];},
			disconnect: async () => {calls.push('disconnect');}, ...overrides};
		const module: any = getModule({checkModules() {}, ms: {socNetAccount: {}, socNetImport: {}}} as any);
		module.getClient = async (userId, account) => {assert.equal(userId, 1);assert.deepEqual(account, {id: 8});return client;};
		return {module, calls};
	}
	it('reads the exact channel/message and never increments views or sends', async () => {
		const {module, calls} = fixture();
		assert.deepEqual(await module.getPostStatistics(1, 8, {chatId: '-100123'}, '5'), {likes: null, views: 20, reposts: 3, replies: 0, reactions: 6});
		assert.deepEqual(calls, [{ids: [5]}, 'disconnect']);
	});
	it('rejects wrong account, missing channel/message and hostile targets, closing sessions', async () => {
		const wrong = fixture({getMe: async () => ({id: bigInt(888)})});
		await assert.rejects(wrong.module.getPostStatistics(1, 8, {chatId: '-100123'}, '5'), /account_changed/);
		assert.deepEqual(wrong.calls, ['disconnect']);
		const absent = fixture({getEntity: async () => {throw Error('not cached');}, getDialogs: async () => []});
		await assert.rejects(absent.module.getPostStatistics(1, 8, {chatId: '-100123'}, '5'), error => (error as any).statisticsStatus === 'access_denied');
		assert.deepEqual(absent.calls, ['disconnect']);
		const missing = fixture({getMessages: async () => []});
		await assert.rejects(missing.module.getPostStatistics(1, 8, {chatId: '-100123'}, '5'), /message_unavailable/);
		await assert.rejects(missing.module.getPostStatistics(1, 8, {chatId: 'https://evil.example'}, '5'), /target_invalid/);
	});
});

describe('existing Telegram phone login reuse', () => {
	it('keeps an existing account intact until the transient code is accepted', async () => {
		const writes = [], methods = [];
		const app: any = {checkModules() {}, ms: {socNetImport: {}, socNetAccount: {
			getAccount: async () => ({id: 5, userId: 1, sessionKey: 'existing-session'}),
			createOrUpdateAccount: async (userId, input) => {writes.push(input);return {userId, ...input};}
		}}};
		const module: any = getModule(app);
		const input = {phoneNumber: '+351912345678', apiId: 12345, apiKey: 'a'.repeat(32), isEncrypted: false};
		const options = {transient: true, transientSession: '', onClient(client) {
			assert.equal(client.session.save(), '');
			client.connect = async () => {};
			client.disconnect = async () => {};
			client.session.save = () => 'new-session';
			client.sendCode = async () => {methods.push('sendCode');return {phoneCodeHash: 'private-hash'};};
			client.invoke = async method => {methods.push(method.className);return {user: {id: bigInt(777), username: 'fixture', firstName: 'Fixture', lastName: 'Reader'}};};
		}};
		const pending = await module.login(1, {...input, stage: 1}, options);
		assert.equal(pending.result.response.phoneCodeHash, 'private-hash');
		assert.equal(writes.length, 0);
		const connected = await module.login(1, {...input, stage: 2, phoneCodeHash: 'private-hash', phoneCode: '12345'}, options);
		assert.equal(connected.result.account.id, 5);
		assert.equal(writes.length, 1);
		assert.equal(writes[0].sessionKey, 'new-session');
		assert.equal(writes[0].apiKey, input.apiKey);
		assert.deepEqual(methods, ['sendCode', 'auth.SignIn']);
	});
	it('returns the optional password stage instead of dereferencing an absent response', async () => {
		const module: any = getModule({checkModules() {}, ms: {socNetImport: {}, socNetAccount: {getAccount: async () => null, createOrUpdateAccount: async () => {throw Error('No write before password');}}}} as any);
		const result = await module.login(1, {phoneNumber: '+351912345678', apiId: 12345, apiKey: 'a'.repeat(32), isEncrypted: false, stage: 2, phoneCodeHash: 'private-hash', phoneCode: '12345'}, {
			transient: true, transientSession: '', onClient(client) {
				client.connect = async () => {};
				client.session.save = () => 'pending-password-session';
				client.invoke = async () => {throw Error('SESSION_PASSWORD_NEEDED');};
			}
		});
		assert.equal(result.error, 'SESSION_PASSWORD_NEEDED');
		assert.equal(result.result.sessionKey, 'pending-password-session');
	});
});
