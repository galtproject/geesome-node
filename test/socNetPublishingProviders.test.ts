import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {createServerProviders, ServerPublicationError} from '../app/modules/socNetPublishing/providers/index.js';

const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const png = Buffer.from('89504e470d0a1a0a01020304', 'hex');
const reference = {storageId: 'QmOwnedImage', mimeType: 'image/png', url: 'https://untrusted.invalid/never-fetch'};
const image = {bytes: png, mimeType: 'image/png'};
const payload = (target: any = {}, overrides: any = {}) => ({text: 'Hello world', attachments: [reference], target, ...overrides});
const response = (body: any, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

function fixture(network: string, override?: (path: string, options: any) => any) {
	const requests: {url: string; options: any}[] = [];
	let mediaReads = 0;
	const fetchImpl: any = async (url: string, options: any = {}) => {
		requests.push({url, options});
		assert.equal(options.redirect, 'error');
		assert(options.signal instanceof AbortSignal);
		const path = new URL(url).pathname;
		const supplied = override?.(path, options);
		if (supplied !== undefined) {
			return supplied;
		}
		if (network === 'bluesky') {
			assert.equal(new URL(url).origin, 'https://bsky.social');
			if (path.endsWith('createSession')) {
				return response({did, handle: 'artist.bsky.social', accessJwt: 'fixture-session-token'});
			}
			if (path.endsWith('uploadBlob')) {
				assert.deepEqual(options.body, png);
				return response({blob: {$type: 'blob', ref: {$link: 'QmUploaded'}, mimeType: 'image/png', size: png.length}});
			}
			if (path.endsWith('resolveHandle')) {
				return response({did});
			}
			if (path.endsWith('createRecord')) {
				return response({uri: `at://${did}/app.bsky.feed.post/post123`, cid: 'QmPost'});
			}
		}
		if (network === 'discord') {
			assert.equal(new URL(url).origin, 'https://discord.com');
			assert.equal(options.headers.authorization, 'Bot fixture.bot.token');
			if (path.endsWith('/users/@me')) {
				return response({id: '12345', bot: true, username: 'artist-bot'});
			}
			if (path.endsWith('/messages')) {
				return response({id: '76543', channel_id: path.split('/').at(-2)});
			}
			if (path.includes('/channels/')) {
				return response({id: path.split('/').at(-1), guild_id: '99999', type: 0, nsfw: true});
			}
		}
		if (network === 'telegram') {
			assert.equal(new URL(url).origin, 'https://api.telegram.org');
			if (path.endsWith('/getMe')) {
				return response({ok: true, result: {id: 12345, is_bot: true, username: 'artist_bot'}});
			}
			if (path.endsWith('/getChat')) {
				const input = JSON.parse(options.body);
				return response({ok: true, result: {id: input.chat_id === '@artist_channel' ? -10098765 : Number(input.chat_id), type: 'channel', username: 'artist_channel'}});
			}
			if (path.endsWith('/getChatMember')) {
				return response({ok: true, result: {user: {id: 12345}, status: 'administrator', can_post_messages: true}});
			}
			if (path.endsWith('/sendPhoto') || path.endsWith('/sendMessage')) {
				return response({ok: true, result: {message_id: 84, chat: {id: -10098765, username: 'artist_channel'}}});
			}
		}
		throw Error(`Unexpected fixture path ${path}`);
	};
	const loadMedia = async (attachment: any, maxBytes: number) => {
		mediaReads++;
		assert.equal(attachment.storageId, 'QmOwnedImage');
		assert(maxBytes >= png.length);
		return image;
	};
	const providers = createServerProviders({fetch: fetchImpl, loadMedia});
	const credentials = network === 'bluesky' ? {identifier: 'artist.bsky.social', appPassword: 'fixture-app-password'}
		: {botToken: network === 'discord' ? 'fixture.bot.token' : '12345:abcdefghijklmnopqrstUVWX'};
	const accountIdentity = network === 'bluesky' ? did : 'bot:12345';
	return {providers, requests, credentials, account: {accountIdentity, credentials}, mediaReads: () => mediaReads};
}

describe('server social publication adapters', () => {
	it('verifies Bluesky through existing session helper without creating a record', async () => {
		const f = fixture('bluesky');
		assert.deepEqual(await f.providers.verify('bluesky', f.credentials, {}), {accountIdentity: did, username: 'artist.bsky.social', target: {}});
		assert.equal(f.requests.length, 1);
		assert.equal(f.mediaReads(), 0);
		assert.deepEqual(JSON.parse(f.requests[0].options.body), {identifier: 'artist.bsky.social', password: 'fixture-app-password'});
	});
	it('publishes Bluesky frozen bytes with facets, UTF-8 offsets and sensitive labels once', async () => {
		const f = fixture('bluesky');
		const text = '🙂 @artist.bsky.social #art example.com';
		const result = await f.providers.publish('bluesky', f.account, payload({sensitive: true}, {text}));
		assert.equal(result.remoteId, `at://${did}/app.bsky.feed.post/post123`);
		assert.equal(f.mediaReads(), 1);
		const creates = f.requests.filter(item => item.url.endsWith('createRecord'));
		assert.equal(creates.length, 1);
		const record = JSON.parse(creates[0].options.body).record;
		assert.equal(record.text, text);
		assert.equal(record.facets.find(item => item.features[0].$type.endsWith('#mention')).index.byteStart, Buffer.byteLength('🙂 '));
		assert.equal(record.embed.images[0].image.ref.$link, 'QmUploaded');
		assert.deepEqual(record.labels.values, [{val: 'porn'}]);
		assert(!f.requests.some(item => item.url.startsWith('https://untrusted.invalid')));
	});
	it('checks Discord bot, both channels and canonical guild at setup without publishing', async () => {
		const f = fixture('discord');
		const connected = await f.providers.verify('discord', f.credentials, {channelId: '11111', sfwChannelId: '22222'});
		assert.deepEqual(connected, {accountIdentity: 'bot:12345', username: 'artist-bot', target: {channelId: '11111', guildId: '99999', sfwChannelId: '22222'}});
		assert.equal(f.requests.length, 3);
		assert.equal(f.mediaReads(), 0);
	});
	it('uploads Discord bytes, preserves endpoint and disables all automatic mentions', async () => {
		const f = fixture('discord');
		const result = await f.providers.publish('discord', f.account, payload({channelId: '11111', guildId: '99999', sensitive: true}));
		assert.equal(result.remoteId, '76543');
		const sent = f.requests.find(item => item.url.endsWith('/messages'));
		assert(sent);
		const body = JSON.parse(sent.options.body.get('payload_json'));
		assert.deepEqual(body.allowed_mentions, {parse: [], users: [], roles: [], replied_user: false});
		assert.deepEqual(Buffer.from(await sent.options.body.get('files[0]').arrayBuffer()), png);
		assert.equal(f.requests.filter(item => item.url.endsWith('/messages')).length, 1);
	});
	it('rejects sensitive Discord content in non-NSFW channel before reading images', async () => {
		const f = fixture('discord', path => path.endsWith('/11111') ? response({id: '11111', guild_id: '99999', type: 0, nsfw: false}) : undefined);
		await assert.rejects(f.providers.publish('discord', f.account, payload({channelId: '11111', sensitive: true})), /NSFW/);
		assert.equal(f.mediaReads(), 0);
		assert(!f.requests.some(item => item.url.endsWith('/messages')));
	});
	it('normalizes Telegram named channels to numeric IDs and verifies bot posting rights', async () => {
		const f = fixture('telegram');
		assert.deepEqual(await f.providers.verify('telegram', f.credentials, {chatId: '@artist_channel'}), {accountIdentity: 'bot:12345', username: 'artist_bot', target: {chatId: '-10098765'}});
		assert.equal(f.requests.filter(item => item.url.endsWith('/getChatMember')).length, 1);
		assert(!f.requests.some(item => /\/send/.test(item.url)));
	});
	it('sends Telegram photo with spoiler and plain caption, requiring exact message/chat acknowledgement', async () => {
		const f = fixture('telegram');
		const result = await f.providers.publish('telegram', f.account, payload({chatId: '-10098765', sensitive: true}));
		assert.deepEqual(result, {remoteId: '84', remoteUrl: 'https://t.me/artist_channel/84'});
		const sent = f.requests.find(item => item.url.endsWith('/sendPhoto'));
		assert(sent);
		assert.equal(sent.options.body.get('chat_id'), '-10098765');
		assert.equal(sent.options.body.get('caption'), 'Hello world');
		assert.equal(sent.options.body.get('has_spoiler'), 'true');
		assert.equal(sent.options.body.get('parse_mode'), null);
		assert.equal(f.requests.filter(item => item.url.endsWith('/sendPhoto')).length, 1);
	});
	it('sends text-only Telegram without parse mode and marks sensitive text as spoiler', async () => {
		const f = fixture('telegram');
		await f.providers.publish('telegram', f.account, payload({chatId: '-10098765', sensitive: true}, {attachments: []}));
		const sent = f.requests.find(item => item.url.endsWith('/sendMessage'));
		const body = JSON.parse(sent.options.body);
		assert.equal(body.parse_mode, undefined);
		assert.deepEqual(body.entities, [{type: 'spoiler', offset: 0, length: 11}]);
		assert.equal(f.mediaReads(), 0);
	});
	it('refuses Telegram bot without channel post rights before uploading or sending', async () => {
		const f = fixture('telegram', path => path.endsWith('/getChatMember') ? response({ok: true, result: {user: {id: 12345}, status: 'administrator', can_post_messages: false}}) : undefined);
		await assert.rejects(f.providers.publish('telegram', f.account, payload({chatId: '-10098765'})), /cannot publish/);
		assert.equal(f.mediaReads(), 0);
		assert(!f.requests.some(item => item.url.endsWith('/sendPhoto')));
	});
	it('refuses a changed stable account identity before provider mutation for all three networks', async () => {
		for (const network of ['bluesky', 'discord', 'telegram']) {
			const f = fixture(network);
			const target = network === 'bluesky' ? {} : network === 'discord' ? {channelId: '11111'} : {chatId: '-10098765'};
			await assert.rejects(f.providers.publish(network, {...f.account, accountIdentity: 'wrong'}, payload(target)), /account changed/);
			assert.equal(f.mediaReads(), 0);
			assert(!f.requests.some(item => /createRecord|\/messages$|\/sendPhoto$/.test(item.url)));
		}
	});
	it('classifies publish timeout, malformed receipt and 5xx as ambiguous without retries', async () => {
		for (const failure of ['timeout', 'malformed', 'server']) {
			const f = fixture('bluesky', path => {
				if (!path.endsWith('createRecord')) {
					return undefined;
				}
				if (failure === 'timeout') {
					throw Error('must-not-expose-fixture-secret');
				}
				return failure === 'server' ? response({error: 'secret'}, 503) : response({uri: 'wrong'});
			});
			await assert.rejects(f.providers.publish('bluesky', f.account, payload()), (error: any) => error instanceof ServerPublicationError && error.ambiguous && !error.message.includes('secret'));
			assert.equal(f.requests.filter(item => item.url.endsWith('createRecord')).length, 1);
		}
	});
	it('treats an explicit provider 400 rejection as known failure and does not retry', async () => {
		const f = fixture('discord', path => path.endsWith('/messages') ? response({message: 'private provider text'}, 400) : undefined);
		await assert.rejects(f.providers.publish('discord', f.account, payload({channelId: '11111'})), (error: any) => !error.ambiguous && !error.message.includes('private'));
		assert.equal(f.requests.filter(item => item.url.endsWith('/messages')).length, 1);
	});
	it('never reports Telegram wrong-chat acknowledgement as published', async () => {
		const f = fixture('telegram', path => path.endsWith('/sendPhoto') ? response({ok: true, result: {message_id: 84, chat: {id: -999}}}) : undefined);
		await assert.rejects(f.providers.publish('telegram', f.account, payload({chatId: '-10098765'})), (error: any) => error.ambiguous === true);
	});
	it('bounds publish response body and preserves unknown outcome', async () => {
		const f = fixture('discord', path => path.endsWith('/messages') ? new Response('x'.repeat(1024 * 1024 + 1)) : undefined);
		await assert.rejects(f.providers.publish('discord', f.account, payload({channelId: '11111'})), (error: any) => error.ambiguous === true && /limit/.test(error.message));
	});
	it('rejects unsupported network, overlong text and too many media before requests', async () => {
		const f = fixture('telegram');
		await assert.rejects(async () => f.providers.publish('twitter', f.account, payload()), /unsupported/);
		await assert.rejects(async () => f.providers.publish('telegram', f.account, payload({chatId: '-10098765'}, {text: 'x'.repeat(1025)})), /text exceeds/);
		await assert.rejects(async () => f.providers.publish('telegram', f.account, payload({chatId: '-10098765'}, {attachments: [reference, reference]})), /image count/);
		assert.equal(f.requests.length, 0);
	});
	it('rejects MIME mismatch and oversized owned bytes before provider mutation', async () => {
		for (const loaded of [{bytes: Buffer.from('GIF89a'), mimeType: 'image/png'}, {bytes: Buffer.alloc(2000001), mimeType: 'image/png'}]) {
			const f = fixture('bluesky');
			await assert.rejects(f.providers.publish('bluesky', f.account, payload(), async () => loaded), /format or size/);
			assert(!f.requests.some(item => item.url.endsWith('uploadBlob') || item.url.endsWith('createRecord')));
		}
	});
});
