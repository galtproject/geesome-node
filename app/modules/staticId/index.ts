import {IGeesomeApp} from "../../interface";
import IGeesomeStaticIdModule, {IStaticIdHistoryItem} from "./interface";
const _ = require('lodash');
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

		async bindToStaticIdByGroup(userId, groupId, dynamicId, staticId) {
			groupId = await app.ms.group.checkGroupId(groupId);
			if(!(await app.ms.group.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			return this.bindToStaticId(await this.getGroupCreatorId(groupId), dynamicId, staticId);
		}

		async getGroupCreatorId(groupId) {
			groupId = await app.ms.group.checkGroupId(groupId);
			return app.ms.group.getGroup(groupId).then(g => g.creatorId);
		}

		async bindToStaticId(userId, dynamicId, staticId): Promise<IStaticIdHistoryItem> {
			log('bindToStaticId', dynamicId, staticId);
			const userIdOfAccount = await app.ms.accountStorage.getUserIdOfLocalStaticIdAccount(staticId);
			console.log('userIdOfAccount', userIdOfAccount, 'userId', userId);
			if (userIdOfAccount !== userId) {
				throw new Error("userId_dont_match");
			}

			try {
				if (await app.ms.communicator.isReady()) {
					//TODO: enable on fluence update

					// await app.ms.communicator.bindToStaticId(staticId, dynamicId);
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
					if (staticIdItem) {
						return resolve(staticIdItem.dynamicId);
					}
				}, 200);

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

		async setStaticAccountGroupId(userId, name, groupId) {
			console.log('setStaticAccountGroupId', name);
			groupId = await app.ms.group.checkGroupId(groupId);
			const account = await app.ms.accountStorage.getLocalAccountByName(name);
			if (account.userId !== userId) {
				throw new Error("not_permitted");
			}
			return app.ms.accountStorage.updateLocalAccountGroupId(name, groupId);
		}

		async createStaticGroupAccountId(userId, groupId, name) {
			console.log('createStaticGroupAccountId', name);
			groupId = await app.ms.group.checkGroupId(groupId);
			return app.ms.accountStorage.createAccount(name, userId, groupId).then(acc => acc.staticId);
		}

		async getOrCreateStaticAccountId(userId, name) {
			return app.ms.accountStorage.getLocalAccountStaticIdByNameAndUserId(name, userId)
				.then(staticId => staticId ? staticId : this.createStaticAccountId(userId, name));
		}

		async renameStaticAccountId(userId, oldName, newName) {
			const account = await app.ms.accountStorage.getLocalAccountByName(oldName);
			if (userId !== account.userId) {
				throw new Error("not_permitted");
			}
			return app.ms.accountStorage.renameLocalAccount(oldName, newName);
		}

		async renameGroupStaticAccountId(userId, groupId, oldName, newName) {
			groupId = await app.ms.group.checkGroupId(groupId);
			const account = await app.ms.accountStorage.getLocalAccountByName(oldName);
			if (account.userId !== userId) {
				if (account.groupId !== groupId || !(await app.ms.group.canEditGroup(userId, groupId))) {
					throw new Error("not_permitted");
				}
			}
			return app.ms.accountStorage.renameLocalAccount(oldName, newName);
		}

		async getOrCreateStaticGroupAccountId(userId, groupId, name) {
			groupId = await app.ms.group.checkGroupId(groupId);
			if (!(await app.ms.group.canEditGroup(userId, groupId))) {
				throw new Error("not_permitted");
			}
			return app.ms.accountStorage.getLocalAccountStaticIdByNameAndGroupId(name, groupId)
				.then(async staticId => staticId ? staticId : this.createStaticGroupAccountId(await this.getGroupCreatorId(groupId), groupId, name));
		}

		async bindToStaticIdByGroupAndCreateIfNotExists(userId, groupId, name, dynamicId) {
			const staticId = await this.getOrCreateStaticGroupAccountId(userId, groupId, name);
			return this.bindToStaticIdByGroup(userId, groupId, dynamicId, staticId);
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['StaticIdHistory'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}

		async isAutoActionAllowed(userId, funcName, funcArgs) {
			return _.includes(['bindToStaticIdByGroupAndCreateIfNotExists'], funcName);
		}
	}

	return new StaticIdModule();
}