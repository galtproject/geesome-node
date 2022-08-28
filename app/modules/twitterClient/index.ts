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

const pIteration = require('p-iteration');
const {FETCH_LIMIT, clearMessageFromMediaMessages, getTweetsParams, handleTwitterLimits, parseTweetsData, makeRepliesList, getReplyToId, getRetweetId} = require('./helpers');

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

		async storeChannelToDb(userId, channel, isCollateral = false) {
			let avatarContent;
			if (channel.profile_image_url) {
				avatarContent = await app.ms.content.saveDataByUrl(userId, channel.profile_image_url, {userId});
			}
			return socNetImport.importChannelMetadata(userId, socNet, channel.id, channel, {
				avatarImageId: avatarContent ? avatarContent.id : null,
				isCollateral
			});
		}

		async runChannelImport(userId, userApiKeyId, accData, username, advancedSettings = {}) {
			const apiKey = await app.getUserApyKeyById(userId, userApiKeyId);
			if (apiKey.userId !== userId) {
				throw new Error("not_permitted");
			}
			const {client} = await this.getClient(userId, accData);
			const {v2} = client.readOnly;
			const {data: channel} = await v2.user(username, { "user.fields": ['profile_image_url'] });

			const dbChannel = await this.storeChannelToDb(userId, channel);
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

					limitItems = await handleTwitterLimits(timeline);
					const {list, nextToken} = parseTweetsData(timeline);
					pagination_token = nextToken;

					await this.importMessagesList(userId, dbChannel, list, advancedSettings, async (m, post) => {
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

		async messageToContents(userId, dbChannel, m) {
			let {entities, text} = m;
			if (entities) {
				text = clearMessageFromMediaMessages(m);
			}
			let textContent;
			if (text) {
				textContent = await app.ms.content.saveData(userId, text, 'tw-' + m.id, {
					mimeType: 'text/html',
					view: ContentView.Contents
				});
			}
			return pIteration
				.map(m.medias, (media) => {
					if (!media)
						return null;
					const {url, alt_text: description} = media;
					return app.ms.content.saveDataByUrl(userId, url, {description, view: ContentView.Media});
				})
				.then(list => [textContent].concat(list).filter(i => i));
		}

		async importReplies(userId, accData, dbChannel, m, messagesById, channelsById) {
			const {client} = await this.getClient(userId, accData);

			let tweetsToFetch = [];
			let repliesToImport = [];
			let limitItems = FETCH_LIMIT;

			makeRepliesList(m, messagesById, repliesToImport, tweetsToFetch);

			while (tweetsToFetch.length > 0) {
				const tweets = await client.v2.readOnly.tweets(tweetsToFetch, getTweetsParams(limitItems));
				limitItems = await handleTwitterLimits(tweets);
				const {list} = parseTweetsData(tweets);
				tweetsToFetch = [];

				repliesToImport = repliesToImport.concat(list);

				list.forEach(item => {
					makeRepliesList(item, messagesById, repliesToImport, tweetsToFetch);
				});
			}

			if (!repliesToImport.length) {
				return;
			}

			await this.importMessagesList(userId, dbChannel, repliesToImport, {});
		}

		async getRemoteRepostOf(m) {

		}

		async importMessagesList(userId, dbChannel, list, advancedSettings, onRemotePostProcess?) {
			const channelByAuthorId = {
				[dbChannel.accountId]: dbChannel
			};
			return socNetImport.importChannelPosts(userId, dbChannel, list, advancedSettings, {
				getRemotePostLink: (_channel, msgId) => `https://twitter.com/${_channel.username}/${msgId}`,
				getRemotePostReplyTo: (m) => getReplyToId(m),
				getRemotePostRepostOf: (m) => getRetweetId(m),
				getRemotePostDbChannel: async (m) => {
					if (!channelByAuthorId[m.author_id]) {
						channelByAuthorId[m.author_id] = await this.storeChannelToDb(userId, m.author, dbChannel.accountId !== m.author_id);
					}
					return channelByAuthorId[m.author_id];
				},
				getRemotePostContents: (userId, dbChannel, m) => this.messageToContents(userId, dbChannel, m),
				getRemotePostProperties: (userId, dbChannel, m) => {
					//TODO: get forward from username and id
					return {};
				},
				onRemotePostProcess
			});
		}
	}

	return new TelegramClientModule();
}
