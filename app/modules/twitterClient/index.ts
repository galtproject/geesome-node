/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {TwitterApi} from 'twitter-api-v2';
import {IGeesomeApp} from "../../interface";
import IGeesomeSocNetImport from "../socNetImport/interface";
import IGeesomeSocNetAccount from "../socNetAccount/interface";
import {ContentView} from "../database/interface";
import {TwitterImportClient} from "./importClient";
import {IMessagesState} from "./interface";

const uniq = require('lodash/uniq');
const {FETCH_LIMIT, getTweetsParams, handleTwitterLimits, parseTweetsData, makeRepliesList} = require('./helpers');

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

	class TwitterClientModule {
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
			return this.getChannelInfoByClient(client, channelId);
		}

		async getChannelInfoByClient(client, channelId) {
			return client.readOnly.v2.user(channelId, { "user.fields": ['profile_image_url'] }).then(r => r.data);
		}

		async getMeByUserId(userId, accData) {
			const {client} = await this.getClient(userId, accData);
			return client.readOnly.v2.me().then(r => r.data);
		}

		async runChannelImportAndWaitForFinish(userId, userApiKeyId, accData, channelId, advancedSettings = {}) {
			const {result: { asyncOperation }} = await this.runChannelImport(userId, userApiKeyId, accData, channelId, advancedSettings).then(r => r);
			return app.ms.asyncOperation.waitForImportAsyncOperation(asyncOperation);
		}

		async storeChannelToDb(userId, accountId, channel, updateData = {}, isCollateral = false) {
			let avatarContent;
			if (channel.profile_image_url) {
				avatarContent = await app.ms.content.saveDataByUrl(userId, channel.profile_image_url, {userId});
			}
			return socNetImport.importChannelMetadata(userId, socNet, accountId, channel, {
				avatarImageId: avatarContent ? avatarContent.id : null,
				isCollateral,
				...updateData
			});
		}

		async runChannelImport(userId, userApiKeyId, accData, username, advancedSettings = {}) {
			const apiKey = await app.getUserApyKeyById(userId, userApiKeyId);
			if (apiKey.userId !== userId) {
				throw new Error("not_permitted");
			}
			const {client, account} = await this.getClient(userId, accData);
			const {v2} = client.readOnly;
			const {data: channel} = await v2.user(username, { "user.fields": ['profile_image_url'] });

			const dbChannel = await this.storeChannelToDb(userId, account.id, channel, {name: advancedSettings['name']});
			const {startMessageId} = await socNetImport.prepareChannelQuery(dbChannel, null, advancedSettings);
			let asyncOperation = await socNetImport.openImportAsyncOperation(userId, userApiKeyId, dbChannel);

			let currentMessageId = startMessageId;
			let limitItems = FETCH_LIMIT;

			(async () => {
				let pagination_token = undefined;

				do {
					let timeline;
					const options = getTweetsParams(limitItems, pagination_token);

					if (startMessageId) {
						//TODO: start_time
						options['since_id'] = startMessageId;
					}
					console.log('options', options);
					if (username === 'home') {
						timeline = await v2.homeTimeline(options);
					} else {
						timeline = await v2.userTimeline(username, options);
					}
					console.log('timeline._realData.data', timeline._realData.data.map(d => JSON.stringify(d)));
					console.log('timeline._realData.errors', timeline._realData.errors.map(e => JSON.stringify(e)));
					console.log('timeline._realData.includes.media', JSON.stringify(timeline._realData.includes.media));

					limitItems = await handleTwitterLimits(timeline, limitItems);
					let messagesState = parseTweetsData(timeline);
					let timeLineListIds = messagesState.listIds;
					pagination_token = messagesState.nextToken;

					messagesState = await this.handleTweetIdsToFetch(client, messagesState);
					messagesState.listIds = timeLineListIds;

					await this.importMessagesList(userId, client, dbChannel, messagesState, advancedSettings, async (m, post, type) => {
						if (type !== 'post' || !m) {
							return;
						}
						console.log('onMessageProcess', m.id);
						currentMessageId = m.id;
						await app.ms.asyncOperation.handleOperationCancel(userId, asyncOperation.id);
						return app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, -1);
					});
				} while (pagination_token)
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

		async handleTweetIdsToFetch(client, messagesState) {
			while (messagesState.tweetIdsToFetch.length) {
				console.log('messagesState.tweetIdsToFetch.length', messagesState.tweetIdsToFetch.length);
				const tweets = await client.v2.readOnly.tweets(messagesState.tweetIdsToFetch, getTweetsParams(null));
				console.log('tweets', tweets);
				messagesState = parseTweetsData(tweets, messagesState);
			}
			return messagesState;
		}

		async saveMedia(userId, media) {
			if (!media)
				return null;
			const {url, alt_text: description} = media;
			return app.ms.content.saveDataByUrl(userId, url, {description, view: ContentView.Media});
		}

		async importReplies(userId, accData, dbChannel, m) {
			const {client} = await this.getClient(userId, accData);

			let tweetsToFetch = [];
			let limitItems = FETCH_LIMIT;

			let messagesState: IMessagesState = {
				listIds: []
			} as any;
			const messagesById = {};
			makeRepliesList(m, messagesById, tweetsToFetch, messagesState);

			while (tweetsToFetch.length > 0) {
				const tweets = await client.v2.readOnly.tweets(tweetsToFetch, getTweetsParams(limitItems));
				limitItems = await handleTwitterLimits(tweets, limitItems);
				messagesState = parseTweetsData(tweets, messagesState);

				tweetsToFetch = [];
				messagesState.listIds.forEach(item => {
					makeRepliesList(item, messagesById, tweetsToFetch, messagesState);
				});
			}

			if (!messagesState.listIds.length) {
				return;
			}

			await this.importMessagesList(userId, client, dbChannel, messagesState, {});
		}

		async importMessagesList(userId, client, dbChannel, messages, advancedSettings, onRemotePostProcess?) {
			messages.channelByAuthorId = {
				[dbChannel.accountId]: dbChannel
			};
			messages.list = uniq(messages.listIds).map(id => messages.tweetsById[id]);
			const twImportClient = new TwitterImportClient(app, client, userId, dbChannel, messages, advancedSettings, onRemotePostProcess);
			return socNetImport.importChannelPosts(twImportClient);
		}
	}

	return new TwitterClientModule();
}
