import {IGeesomeApp} from "../../interface";
import {
	IStaticIdHistoryItem
} from "../database/interface";
import IGeesomeStaticIdModule from "./interface";
const _ = require('lodash');
const commonHelper = require('geesome-libs/src/common');
const log = require('debug')('geesome:app');
const peerIdHelper = require('geesome-libs/src/peerIdHelper');

module.exports = async (app: IGeesomeApp) => {
	const module = getModule(app);
	await app.ms.database.closeAllAsyncOperation();
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database', 'content', 'communicator']);

	class StaticIdModule implements IGeesomeStaticIdModule {
		async bindToStaticId(dynamicId, staticId): Promise<IStaticIdHistoryItem> {
			log('bindToStaticId', dynamicId, staticId);
			try {
				await app.ms.communicator.bindToStaticId(dynamicId, staticId);
				log('bindToStaticId:communicator finish');
			} catch (e) {
				log('bindToStaticId:communicator error', e);
			}
			// await this.ms.database.destroyStaticIdHistory(staticId);

			return app.ms.database.addStaticIdHistoryItem({
				staticId,
				dynamicId,
				isActive: true,
				boundAt: new Date()
			}).catch(() => null);
		}

		async resolveStaticId(staticId): Promise<any> {
			return new Promise(async (resolve, reject) => {
				let alreadyHandled = false;

				const staticIdItem = await app.ms.database.getActualStaticIdItem(staticId);

				setTimeout(() => {
					if(alreadyHandled) {
						return;
					}
					alreadyHandled = true;
					log('resolve by timeout', staticId, '=>', staticIdItem ? staticIdItem.dynamicId : null);
				}, 1000);

				let dynamicId;
				try {
					let dynamicItem = await app.ms.communicator.resolveStaticItem(staticId);
					if (staticIdItem && dynamicItem && dynamicItem.createdAt > staticIdItem.boundAt.getTime() / 1000) {
						dynamicId = dynamicItem.value;
						log('resolve by communicator', staticId, '=>', dynamicId);
					} else if (staticIdItem) {
						dynamicId = staticIdItem.dynamicId;
						log('resolve by database', staticId, '=>', dynamicId);
					}
				} catch (err) {
					console.error('communicator.resolveStaticId error', err);
					if (staticIdItem) {
						alreadyHandled = true;
						log('resolve by catch', staticId, '=>', staticIdItem.dynamicId);
						return resolve(staticIdItem.dynamicId);
					} else {
						throw (err);
					}
				}

				resolve(dynamicId);
				alreadyHandled = true;
				if (dynamicId && dynamicId !== 'null') {
					return app.ms.database.addStaticIdHistoryItem({
						staticId: staticId,
						dynamicId: dynamicId,
						isActive: true,
						boundAt: new Date()
					}).catch(() => {/* already have */});
				}
			});
		}

		async getStaticIdPeers(ipnsId) {
			const peers = await app.ms.communicator.getStaticIdPeers(ipnsId);
			return {
				count: peers.length,
				list: peers
			}
		}

		async getSelfStaticAccountId() {
			return app.ms.communicator.getAccountIdByName('self');
		}

		async createStaticAccountId(name) {
			const storageAccountId = await app.ms.communicator.createAccountIfNotExists(name + commonHelper.makeCode(8));

			app.ms.communicator.getAccountPublicKey(storageAccountId).then(publicKey => {
				return app.ms.database.setStaticIdKey(storageAccountId, peerIdHelper.publicKeyToBase64(publicKey)).catch(() => {
					/*dont do anything*/
				});
			}).catch(e => {
				console.warn('error public key caching', e);
			});
			return storageAccountId;
		}

	}

	return new StaticIdModule();
}