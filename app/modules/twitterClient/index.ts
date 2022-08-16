/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import { TwitterApi } from 'twitter-api-v2';
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
			let {id: accountId, apiToken, encryptedApiToken, isEncrypted} = loginData;

			const client = new TwitterApi(apiToken);
			const roClient = client.readOnly;
			const [user] = await roClient.v2.me();

			const sessionKey = isEncrypted ? apiToken : encryptedApiToken;

			const existAccount = await socNetAccount.getAccount(userId, socNet, {id: accountId});
			const acc = await socNetAccount.createOrUpdateAccount(userId, {
				id: existAccount ? existAccount.id : null,
				sessionKey,
				isEncrypted,
				socNet
			});
			return {client, result: {response: user, account: acc}};
		}

		async getClient(userId, accData) {
			return new TwitterApi(accData.sessionKey);
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
			const client = await this.getClient(userId, accData);
			const {v2} = client.readOnly;
			const [channel] = await v2.user(username);

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
