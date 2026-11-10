import {check, secret, jsonOptions, loadImages, readJson, ServerPublicationError} from './common.js';

const chatIdPattern = /^(?:-?[1-9][0-9]{0,19}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;
export function createTelegramProvider(transport: any) {
	async function api(token: string, method: string, options: any, mayPublish = false) {
		const body = await readJson(transport, `https://api.telegram.org/bot${token}/${method}`, options, mayPublish);
		if (body?.ok === false && Number.isInteger(body.error_code)) {
			throw new ServerPublicationError('Telegram rejected the request', mayPublish && body.error_code >= 500);
		}
		check(body?.ok === true && body.result && typeof body.result === 'object', 'Telegram response was not confirmed', mayPublish);
		return body.result;
	}
	async function identity(credentials: any) {
		const token = secret(credentials?.botToken);
		check(/^[1-9][0-9]{4,15}:[A-Za-z0-9_-]{20,128}$/.test(token), 'Telegram bot credential is invalid');
		const bot = await api(token, 'getMe', {method: 'GET'});
		check(Number.isSafeInteger(bot.id) && bot.id > 0 && bot.is_bot === true && String(bot.id) === token.split(':')[0], 'Telegram bot identity was not confirmed');
		return {token, botId: bot.id, accountIdentity: `bot:${bot.id}`, username: typeof bot.username === 'string' ? bot.username.slice(0, 200) : ''};
	}
	async function chat(bot: any, suppliedId: any, photos = false) {
		check(typeof suppliedId === 'string' && chatIdPattern.test(suppliedId), 'Telegram destination is invalid');
		const result = await api(bot.token, 'getChat', jsonOptions({chat_id: suppliedId}));
		check(Number.isSafeInteger(result.id) && result.id !== 0 && ['private', 'group', 'supergroup', 'channel'].includes(result.type), 'Telegram chat identity was not confirmed');
		check(suppliedId.startsWith('@') ? typeof result.username === 'string' && result.username.toLowerCase() === suppliedId.slice(1).toLowerCase() : suppliedId === String(result.id), 'Telegram target chat changed');
		if (result.type !== 'private') {
			const member = await api(bot.token, 'getChatMember', jsonOptions({chat_id: String(result.id), user_id: bot.botId}));
			check(member?.user?.id === bot.botId && ['creator', 'administrator', 'member', 'restricted'].includes(member.status), 'Telegram bot has no access to the chat');
			if (result.type === 'channel') {
				check(member.status === 'creator' || member.status === 'administrator' && member.can_post_messages === true, 'Telegram bot cannot publish in this channel');
			} else if (member.status === 'restricted') {
				check(member.is_member === true && member.can_send_messages === true && (!photos || member.can_send_photos === true), 'Telegram bot cannot publish this payload');
			} else if (member.status === 'member') {
				check(result.permissions?.can_send_messages !== false && (!photos || result.permissions?.can_send_photos !== false), 'Telegram chat disallows this payload');
			}
		}
		return result;
	}
	return {
		async verify(credentials: any, target: any = {}) {
			check(target && Object.keys(target).every(key => ['chatId', 'sfwChatId'].includes(key)), 'Telegram destination parameters are invalid');
			const bot = await identity(credentials);
			const main = await chat(bot, target.chatId, true);
			const sfw = target.sfwChatId === undefined ? null : await chat(bot, target.sfwChatId, true);
			return {accountIdentity: bot.accountIdentity, username: bot.username, target: {chatId: String(main.id), ...(sfw ? {sfwChatId: String(sfw.id)} : {})}};
		},
		async publish(account: any, payload: any, loadMedia: any) {
			check(Object.keys(payload.target).every(key => ['chatId', 'sensitive'].includes(key)) && typeof payload.target.chatId === 'string' && /^-?[1-9][0-9]{0,19}$/.test(payload.target.chatId), 'Telegram publication needs a frozen numeric chat');
			const bot = await identity(account.credentials);
			check(bot.accountIdentity === account.accountIdentity, 'Telegram publishing account changed');
			const destination = await chat(bot, payload.target.chatId, payload.attachments.length > 0);
			const images = await loadImages(payload, loadMedia, 10000000);
			const sensitive = payload.target.sensitive ?? true;
			let method, options;
			if (images.length) {
				method = 'sendPhoto';
				const image = images[0];
				const form = new FormData();
				form.append('chat_id', String(destination.id));
				form.append('caption', payload.text);
				form.append('has_spoiler', String(sensitive));
				form.append('photo', new Blob([image.bytes], {type: image.mimeType}), image.mimeType === 'image/jpeg' ? 'image.jpg' : 'image.png');
				options = {method: 'POST', body: form};
			} else {
				method = 'sendMessage';
				options = jsonOptions({chat_id: String(destination.id), text: payload.text, link_preview_options: {is_disabled: true},
					...(sensitive ? {entities: [{type: 'spoiler', offset: 0, length: payload.text.length}]} : {})});
			}
			const result = await api(bot.token, method, options, true);
			check(Number.isSafeInteger(result.message_id) && result.message_id > 0 && Number.isSafeInteger(result.chat?.id) && result.chat.id === destination.id, 'Telegram did not confirm the message and chat ID', true);
			const messageId = String(result.message_id);
			const username = typeof result.chat.username === 'string' && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(result.chat.username) ? result.chat.username : '';
			const numeric = String(destination.id);
			const remoteUrl = username ? `https://t.me/${username}/${messageId}` : /^-100[1-9][0-9]*$/.test(numeric) ? `https://t.me/c/${numeric.slice(4)}/${messageId}` : '';
			return {remoteId: messageId, remoteUrl};
		}
	};
}
