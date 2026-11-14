import {createDeviantArtStatisticsReader} from './deviantartStatistics.js';
import {createTransport, readJson, check, snowflake, didPattern} from '../socNetPublishing/providers/common.js';

export function createStatisticsReader(fetchImpl = fetch) {
	const transport = createTransport(fetchImpl);
	const deviantart = createDeviantArtStatisticsReader(fetchImpl);
	const read = async (url, headers = {}) => {
		try {
			return await readJson(transport, url, {headers});
		} catch (error) {
			const status = /HTTP (401|403)/.test(error.message) ? 'access_denied' : /HTTP 429/.test(error.message) ? 'rate_limited' : 'unavailable';
			throw Object.assign(new Error('social_statistics_read_failed'), {statisticsStatus: status});
		}
	};
	return async ({network, kind, account, target, remoteId}) => {
		if (network === 'deviantart') {
			return deviantart({kind, account, remoteId});
		}
		if (network === 'bluesky') {
			check(didPattern.test(account.accountIdentity || ''), 'Invalid Bluesky identity');
			const root = 'https://public.api.bsky.app/xrpc/';
			if (kind === 'group') {
				const profile = await read(`${root}app.bsky.actor.getProfile?actor=${encodeURIComponent(account.accountIdentity)}`);
				check(profile.did === account.accountIdentity, 'Bluesky identity changed');
				return {followers: count(profile.followersCount)};
			}
			check(typeof remoteId === 'string' && remoteId.startsWith(`at://${account.accountIdentity}/app.bsky.feed.post/`), 'Invalid Bluesky receipt');
			const post = (await read(`${root}app.bsky.feed.getPosts?uris=${encodeURIComponent(remoteId)}`)).posts?.find(row => row.uri === remoteId);
			check(post, 'Bluesky post unavailable');
			return {likes: count(post.likeCount), views: null, replies: count(post.replyCount), reposts: count(post.repostCount)};
		}
		if (network === 'telegram') {
			if (kind === 'post') {
				return null;
			}
			const token = account.credentials?.botToken;
			check(typeof token === 'string' && /^[1-9][0-9]{4,15}:[A-Za-z0-9_-]{20,128}$/.test(token) && /^-?[1-9][0-9]{0,19}$/.test(target?.chatId || ''), 'Invalid Telegram account');
			const body = await read(`https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${encodeURIComponent(target.chatId)}`);
			check(body.ok === true, 'Telegram unavailable');
			return {followers: count(body.result)};
		}
		if (network === 'discord') {
			const token = account.credentials?.botToken;
			check(typeof token === 'string' && /^[A-Za-z0-9._-]+$/.test(token) && snowflake(target?.channelId) && snowflake(target?.guildId), 'Invalid Discord account');
			const headers = {authorization: `Bot ${token}`}, root = 'https://discord.com/api/v10';
			if (kind === 'group') {
				const guild = await read(`${root}/guilds/${target.guildId}?with_counts=true`, headers);
				check(guild.id === target.guildId, 'Discord guild changed');
				return {members: count(guild.approximate_member_count), online: Number.isSafeInteger(guild.approximate_presence_count) ? count(guild.approximate_presence_count) : null};
			}
			check(snowflake(remoteId), 'Invalid Discord receipt');
			const post = await read(`${root}/channels/${target.channelId}/messages/${remoteId}`, headers);
			check(post.id === remoteId && post.channel_id === target.channelId, 'Discord message changed');
			return {likes: null, views: null, reactions: (post.reactions || []).reduce((sum, row) => sum + count(row.count), 0)};
		}
		return null;
	};
}
function count(value) {
	check(Number.isSafeInteger(value) && value >= 0, 'Invalid provider metric');
	return value;
}
