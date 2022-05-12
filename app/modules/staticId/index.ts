import {IGeesomeApp} from "../../interface";
import IGeesomeStaticIdModule, {IStaticIdHistoryItem} from "./interface";
const commonHelper = require('geesome-libs/src/common');
// + commonHelper.makeCode(8)
const log = require('debug')('geesome:app');
const pIteration = require('p-iteration');

module.exports = async (app: IGeesomeApp) => {
	const module = getModule(app, await require('./models')());
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	app.checkModules(['accountStorage', 'content', 'communicator']);

	class StaticIdModule implements IGeesomeStaticIdModule {
		async bindToStaticIdByName() {
			//TODO: implement
		}

		async addStaticIdHistoryItem(staticIdItem) {
			return models.StaticIdHistory.create(staticIdItem);
		}

		async getActualStaticIdItem(staticId) {
			return models.StaticIdHistory.findOne({where: {staticId}, order: [['boundAt', 'DESC']]}) as IStaticIdHistoryItem;
		}

		async destroyStaticIdHistory(staticId) {
			return models.StaticIdHistory.destroy({where: {staticId}});
		}

		async getStaticIdItemByDynamicId(dynamicId) {
			return models.StaticIdHistory.findOne({where: {dynamicId}, order: [['boundAt', 'DESC']]}) as IStaticIdHistoryItem;
		}

		async bindToStaticId(userId, dynamicId, staticId): Promise<IStaticIdHistoryItem> {
			log('bindToStaticId', dynamicId, staticId);
			const userIdOfAccount = await app.ms.accountStorage.getUserIdOfLocalStaticIdAccount(staticId);
			if (userIdOfAccount !== userId) {
				throw new Error("userId_dont_match");
			}

			try {
				if (await app.ms.communicator.isReady()) {
					await app.ms.communicator.bindToStaticId(dynamicId, staticId);
					log('bindToStaticId:communicator finish');
				} else {
					log('bindToStaticId:communicator not ready');
				}
			} catch (e) {
				log('bindToStaticId:communicator error', e);
			}
			return this.addStaticIdHistoryItem({
				staticId,
				dynamicId,
				isActive: true,
				boundAt: new Date()
			}).catch(() => null);
		}

		async resolveStaticId(staticId): Promise<any> {
			return new Promise(async (resolve, reject) => {
				let alreadyHandled = false;

				const staticIdItem = await this.getActualStaticIdItem(staticId);

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
					return this.addStaticIdHistoryItem({
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
			return app.ms.accountStorage.getAccountStaticId('self');
		}

		async createStaticAccountId(userId, name) {
			return app.ms.accountStorage.createAccount(name, userId).then(acc => acc.staticId);
		}

		async getOrCreateStaticAccountId(userId, name) {
			return app.ms.accountStorage.getLocalAccountStaticIdByNameAndUserId(name, userId)
				.then(staticId => staticId ? staticId : this.createStaticAccountId(userId, name));
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['StaticIdHistory'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new StaticIdModule();
}