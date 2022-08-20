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
			const {data: user} = await client.readOnly.v2.me();
			return [user].concat(data);
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
			const {data: channel} = await v2.me();

			let avatarContent;
			if (channel.profile_image_url) {
				avatarContent = await app.ms.content.saveDataByUrl(userId, channel.profile_image_url, {userId});
			}
			const dbChannel = await socNetImport.importChannelMetadata(userId, socNet, accData.id, channel, {
				avatarImageId: avatarContent ? avatarContent.id : null
			});
			const {startMessageId, lastMessageId} = await socNetImport.prepareChannelQuery(dbChannel, channel.messagesCount, advancedSettings);
			let asyncOperation = await socNetImport.openImportAsyncOperation(userId, userApiKeyId, dbChannel);

			const totalCountToFetch = lastMessageId - startMessageId;
			let currentMessageId = startMessageId;
			(async () => {
				let pagination_token;

				while (pagination_token) {
					let timeline;
					const options = {
						since_id: startMessageId,
						pagination_token
					};
					if (username === 'home') {
						timeline = await v2.homeTimeline(options);
					} else {
						timeline = await v2.userTimeline(userId, options);
					}
					pagination_token = timeline.next_token;
					console.log(timeline.data);

					// await socNetImport.importChannelPosts(userId, dbChannel, messages, advancedSettings, {
					// 	getRemotePostLink: (channelId, msgId) => this.getMessageLink(client, channelId, msgId),
					// 	getRemotePostContents: (userId, dbChannel, m) => this.messageToContents(client, userId, dbChannel, m),
					// 	getRemotePostProperties: (userId, dbChannel, m) => {
					// 		//TODO: get forward from username and id
					// 		return {};
					// 	},
					// 	async onRemotePostProcess(m, post) {
					// 		console.log('onMessageProcess', m.id.toString());
					// 		currentMessageId = parseInt(m.id.toString());
					// 		dbChannel.update({lastMessageId: currentMessageId});
					// 		await app.ms.asyncOperation.handleOperationCancel(userId, asyncOperation.id);
					// 		return app.ms.asyncOperation.updateAsyncOperation(userId, asyncOperation.id, (1 - (lastMessageId - currentMessageId) / totalCountToFetch) * 100);
					// 	}
					// });
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
	}

	return new TelegramClientModule();
}
