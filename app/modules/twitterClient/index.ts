/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {Tweetv2FieldsParams, TwitterApi} from 'twitter-api-v2';
import {IGeesomeApp} from "../../interface";
import IGeesomeSocNetImport from "../socNetImport/interface";
import IGeesomeSocNetAccount from "../socNetAccount/interface";
import {TweetV2UserTimelineParams} from "twitter-api-v2/dist/types";
import {ContentView} from "../database/interface";

const pIteration = require('p-iteration');
const {clearMessageFromMediaMessages} = require('./helpers');

module.exports = async (app: IGeesomeApp) => {
	const module = getModule(app);

	require('./api')(app, module);

	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['asyncOperation', 'group', 'content', 'socNetImport']);

	const socNet = 'twitter';
	const socNetImport = app.ms['socNetImport'] as IGeesomeSocNetImport;
	const socNetAccount = app.ms['socNetAccount'] as IGeesomeSocNetAccount;

	const FETCH_LIMIT = 100;

	function getTweetsParams(max_results = 20, pagination_token = undefined) {
		return {
			max_results,
			pagination_token,
			"expansions": ['attachments.media_keys', 'referenced_tweets.id.author_id', 'referenced_tweets.id', 'author_id', 'in_reply_to_user_id'],
			"media.fields": ['url', 'alt_text', 'type', 'preview_image_url', 'duration_ms'],
			// "place.fields": ['contained_within', 'country', 'country_code', 'full_name', 'geo', 'id', 'name', 'place_type'],
			// "poll.fields": ['duration_minutes', 'end_datetime', 'id', 'options', 'voting_status'],
			"user.fields": ['profile_image_url'],
			"tweet.fields": ['attachments', 'author_id', 'context_annotations', 'conversation_id', 'created_at', 'entities', 'geo', 'id', 'in_reply_to_user_id', 'lang', 'possibly_sensitive', 'referenced_tweets', 'reply_settings', 'source', 'text', 'withheld']
		} as Tweetv2FieldsParams;
	}

	async function handleTwitterLimits(response) {
		const {limit, remaining, reset} = response['_rateLimit'];
		if (!remaining) {
			const currentTimestamp = Math.round(new Date().getTime() / 1000);
			if (currentTimestamp < reset) {
				await new Promise((resolve) => setTimeout(resolve, reset - currentTimestamp));
			}
			return FETCH_LIMIT;
		} else {
			return remaining;
		}
	}

	function parseTweetsData(response, mediasByKey = {}) {
		const {data: list, meta, includes} = response['_realData'];

		includes.media.forEach(item => {
			mediasByKey[item.media_key] = item;
		});
		return {list, nextToken: meta.next_token, mediasByKey};
	}

	class TelegramClientModule {
		async login(userId, loginData) {
			let {id: accountId, apiId, apiKey, accessToken, sessionKey, encryptedSessionKey, encryptedApiKey, isEncrypted} = loginData;

			const client = new TwitterApi({
				appKey: apiId,
				appSecret: apiKey,
				accessToken,
				accessSecret: sessionKey
			});
			const roClient = client.readOnly;
			const {data: user} = await roClient.v2.me();
			const existAccount = accountId ? await socNetAccount.getAccount(userId, socNet, {id: accountId}) : null;
			const acc = await socNetAccount.createOrUpdateAccount(userId, {
				id: existAccount ? existAccount.id : null,
				accountId: user.id,
				username: user.username,
				fullName: user.name,
				apiId,
				apiKey: isEncrypted ? encryptedApiKey : apiKey,
				accessToken,
				sessionKey: isEncrypted ? encryptedSessionKey : sessionKey,
				isEncrypted,
				socNet
			});
			return {response: user, account: acc, sessionKey, apiKey};
		}

		async getClient(userId, accData) {
			const account = await socNetAccount.getAccount(userId, socNet, {id: accData.id});
			const client = new TwitterApi({
				appKey: account.apiId,
				appSecret: accData.apiKey,
				accessToken: account.accessToken,
				accessSecret: accData.sessionKey
			});
			return {account, client: client};
		}

		async getUserChannelsByUserId(userId, accData) {
			const {account, client} = await this.getClient(userId, accData);
			const {data} = await client.readOnly.v2.following(account.accountId);
			return client.readOnly.v2.me().then(r => [{name: 'Home', username: 'home', id: -1}, r.data].concat(data))
		}

		async getChannelInfoByUserId(userId, accData, channelId) {
			const {client} = await this.getClient(userId, accData);
			const timeline = await client.readOnly.v2.userTimeline(channelId, getTweetsParams(20));
			// console.log('timeline', timeline);
			const {limit, remaining, reset} = timeline['_rateLimit'];
			const {data, meta, includes} = timeline['_realData'];
			// console.log('data', data, 'entities', data[0].entities, 'includes', includes, 'meta', meta);
			console.log('data 0', JSON.stringify(data[0]), '\ndata 1', JSON.stringify(data[1]), '\ndata 2', JSON.stringify(data[2]), '\ndata 4', JSON.stringify(data[4]), '\ndata 5', JSON.stringify(data[5]), '\ndata 6', JSON.stringify(data[6]), '\ndata 7', JSON.stringify(data[7]), '\ndata 9', JSON.stringify(data[9]), 'entities', data[0].entities, '\nincludes', JSON.stringify(includes), 'meta', meta);
			return client.readOnly.v2.user(channelId).then(r => r.data);
			// return client.readOnly.v2.user(channelId, { "user.fields": ['profile_image_url'] }).then(r => r.data);
		}

		async getMeByUserId(userId, accData) {
			const {client} = await this.getClient(userId, accData);
			return client.readOnly.v2.me().then(r => r.data);
		}

		async runChannelImportAndWaitForFinish(userId, userApiKeyId, accData, channelId, advancedSettings = {}) {
			const {result: { asyncOperation }} = await this.runChannelImport(userId, userApiKeyId, accData, channelId, advancedSettings).then(r => r);
			return app.ms.asyncOperation.waitForImportAsyncOperation(asyncOperation);
		}

		async runChannelImport(userId, userApiKeyId, accData, username, advancedSettings = {}) {
			const apiKey = await app.getUserApyKeyById(userId, userApiKeyId);
			if (apiKey.userId !== userId) {
				throw new Error("not_permitted");
			}
			const {client} = await this.getClient(userId, accData);
			const {v2} = client.readOnly;
			const {data: channel} = await v2.user(username, { "user.fields": ['profile_image_url'] });

			let avatarContent;
			if (channel.profile_image_url) {
				avatarContent = await app.ms.content.saveDataByUrl(userId, channel.profile_image_url, {userId});
			}
			const dbChannel = await socNetImport.importChannelMetadata(userId, socNet, accData.id, channel, {
				avatarImageId: avatarContent ? avatarContent.id : null
			});
			const {startMessageId} = await socNetImport.prepareChannelQuery(dbChannel, null, advancedSettings);
			let asyncOperation = await socNetImport.openImportAsyncOperation(userId, userApiKeyId, dbChannel);

			let currentMessageId = startMessageId;
			let limitItems = FETCH_LIMIT;

			(async () => {
				let pagination_token;

				while (pagination_token) {
					let timeline;
					const options = getTweetsParams(limitItems, pagination_token);

					if (startMessageId) {
						options['since_id'] = startMessageId;
					}
					if (username === 'home') {
						timeline = await v2.homeTimeline(options);
					} else {
						timeline = await v2.userTimeline(username, options);
					}
					// console.log('timeline', timeline);
					// console.log('data', data[0], 'includes', includes, 'meta', meta);

					limitItems = await handleTwitterLimits(timeline);
					const {list, mediasByKey, nextToken} = parseTweetsData(timeline);
					pagination_token = nextToken;

					await this.importMessagesList(userId, dbChannel, list, advancedSettings, mediasByKey, async (m, post) => {
						console.log('onMessageProcess', m.id);
						currentMessageId = parseInt(m.id);
						await app.ms.asyncOperation.handleOperationCancel(userId, asyncOperation.id);
						return app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, -1);
					});
				}
			})().then(async () => {
				return app.ms.asyncOperation.closeImportAsyncOperation(userId, asyncOperation, null);
			}).catch((e) => {
				console.error('run-telegram-channel-import error', e);
				return app.ms.asyncOperation.closeImportAsyncOperation(userId, asyncOperation, e);
			});

			return {
				result: {asyncOperation},
				client
			}
		}

		async messageToContents(userId, dbChannel, m, mediasByKey) {
			let {entities, text} = m;
			if (entities && entities.urls) {
				text = clearMessageFromMediaMessages(text, entities.urls);
			}
			let textContent;
			if (text) {
				textContent = await app.ms.content.saveData(userId, text, 'tw-' + m.id, {
					mimeType: 'text/html',
					view: ContentView.Contents
				});
			}
			const medias = m.attachments.media_keys.map(mediaKey => mediasByKey[mediaKey]);
			return pIteration
				.map(medias, (media) => {
					if (!media)
						return null;
					const {url, alt_text: description} = media;
					return app.ms.content.saveDataByUrl(userId, url, {description, view: ContentView.Media});
				})
				.then(list => [textContent].concat(list).filter(i => i));
		}

		async importReplies(userId, accData, dbChannel, m, messagesById, channelsById, mediasByKey) {
			const {client} = await this.getClient(userId, accData);

			let tweetsToFetch = [];
			let repliesToImport = [];
			let limitItems = FETCH_LIMIT;

			this.makeRepliesList(m, messagesById, repliesToImport, tweetsToFetch);

			while (tweetsToFetch.length > 0) {
				const tweets = await client.v2.readOnly.tweets(tweetsToFetch, getTweetsParams(limitItems));
				tweetsToFetch = [];

				repliesToImport = repliesToImport.concat(tweets);

				limitItems = await handleTwitterLimits(tweets);
				const {list} = parseTweetsData(tweets, mediasByKey);
				list.forEach(item => {
					this.makeRepliesList(item, messagesById, repliesToImport, tweetsToFetch);
				});
			}

			if (!repliesToImport.length) {
				return;
			}

			await this.importMessagesList(userId, dbChannel, repliesToImport, {}, mediasByKey);
		}

		makeRepliesList(m, messagesById, repliesToImport = [], tweetsToFetch = []) {
			if (!m.referenced_tweets) {
				return;
			}
			m.referenced_tweets.forEach(rt => {
				if (messagesById[rt.id].inList) {
					return;
				}
				if (messagesById[rt.id]) {
					repliesToImport.push(messagesById[rt.id]);
					messagesById[rt.id].inList = true;
					this.makeRepliesList(m, messagesById, repliesToImport, tweetsToFetch);
				} else {
					tweetsToFetch.push(rt.id);
				}
			});
			messagesById[m.id] = {inList: true}
			return {repliesToImport, tweetsToFetch};
		}

		async importMessagesList(userId, dbChannel, list, advancedSettings, mediasByKey, onRemotePostProcess?) {
			return socNetImport.importChannelPosts(userId, dbChannel, list, advancedSettings, {
				getRemotePostLink: (channelId, msgId) => `https://twitter.com/${dbChannel.username}/${msgId}`,
				getRemotePostReplyTo: (m) => this.getReplyTo(m),
				getRemotePostContents: (userId, dbChannel, m) => this.messageToContents(userId, dbChannel, m, mediasByKey),
				getRemotePostProperties: (userId, dbChannel, m) => {
					//TODO: get forward from username and id
					return {};
				},
				async onRemotePostProcess(m, post) {
					if (onRemotePostProcess) {
						return onRemotePostProcess(m, post);
					}
				}
			});
		}

		getReplyTo(m) {
			return m.referenced_tweets ? (m.referenced_tweets.filter(rt => rt.type === 'replied_to')[0] || {id: null}).id : null
		}
	}

	return new TelegramClientModule();
}
