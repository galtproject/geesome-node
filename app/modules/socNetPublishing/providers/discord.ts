import {check, secret, snowflake, jsonOptions, loadImages, readJson} from './common.js';

const root = 'https://discord.com/api/v10';
export function createDiscordProvider(transport: any) {
	async function identity(credentials: any) {
		const token = secret(credentials?.botToken);
		check(/^[A-Za-z0-9._-]+$/.test(token), 'Discord bot credential is invalid');
		const headers = {authorization: `Bot ${token}`};
		const bot = await readJson(transport, `${root}/users/@me`, {headers});
		check(snowflake(bot?.id) && bot.bot === true, 'Discord bot identity was not confirmed');
		return {accountIdentity: `bot:${bot.id}`, username: typeof bot.username === 'string' ? bot.username.slice(0, 200) : '', headers};
	}
	async function channel(headers: any, channelId: any, guildId?: any) {
		check(snowflake(channelId) && (guildId === undefined || snowflake(guildId)), 'Discord destination is invalid');
		const result = await readJson(transport, `${root}/channels/${channelId}`, {headers});
		check(result?.id === channelId && snowflake(result.guild_id) && (!guildId || guildId === result.guild_id), 'Discord channel or guild identity was not confirmed');
		check(result.type === undefined || [0, 5, 10, 11, 12].includes(result.type), 'Discord destination does not accept messages');
		return result;
	}
	return {
		async verify(credentials: any, target: any = {}) {
			check(target && Object.keys(target).every(key => ['channelId', 'guildId'].includes(key)), 'Discord destination parameters are invalid');
			const bot = await identity(credentials);
			const main = await channel(bot.headers, target.channelId, target.guildId);

			return {accountIdentity: bot.accountIdentity, username: bot.username,
				target: {channelId: main.id, guildId: main.guild_id}};
		},
		async publish(account: any, payload: any, loadMedia: any) {
			check(Object.keys(payload.target).every(key => ['channelId', 'guildId'].includes(key)), 'Discord publication parameters are invalid');
			const bot = await identity(account.credentials);
			check(bot.accountIdentity === account.accountIdentity, 'Discord publishing account changed');
			const destination = await channel(bot.headers, payload.target.channelId, payload.target.guildId);
			check(!(payload.contentType === 'nsfw') || destination.nsfw === true, 'Sensitive Discord publication requires an NSFW channel');
			const images = await loadImages(payload, loadMedia, 8 * 1024 * 1024);
			const body: any = {content: payload.text, allowed_mentions: {parse: [], users: [], roles: [], replied_user: false}};
			let options;
			if (images.length) {
				const image = images[0];
				const name = image.mimeType === 'image/jpeg' ? 'image.jpg' : 'image.png';
				body.attachments = [{id: 0, filename: name}];
				const form = new FormData();
				form.append('payload_json', JSON.stringify(body));
				form.append('files[0]', new Blob([image.bytes], {type: image.mimeType}), name);
				options = {method: 'POST', headers: bot.headers, body: form};
			} else {
				options = jsonOptions(body, bot.headers);
			}
			const result = await readJson(transport, `${root}/channels/${destination.id}/messages`, options, true);
			check(snowflake(result?.id) && result.channel_id === destination.id, 'Discord did not confirm the publication ID', true);
			return {remoteId: result.id, remoteUrl: `https://discord.com/channels/${destination.guild_id}/${destination.id}/${result.id}`};
		}
	};
}
