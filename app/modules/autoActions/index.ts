import {IGeesomeApp} from "../../interface";
import IGeesomeAutoActionsModule, {IAutoAction} from "./interface";

const Op = require("sequelize").Op;
const pIteration = require("p-iteration");
const some = require("lodash/some");
const commonHelpers = require('geesome-libs/src/common');
const orderBy = require("lodash/orderBy");
const reverse = require("lodash/reverse");

module.exports = async (app: IGeesomeApp) => {
	const models = await require("./models")();
	const module = await getModule(app, models);
	require('./api')(app, module);
	require('./cron')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {

	class AutoActionsModule implements IGeesomeAutoActionsModule {
		async addAutoAction(userId, autoAction) {
			const nextActions = await this.getNextActionsToStore(userId, autoAction.nextActions);

			await this.encryptAutoActionIfNecessary(autoAction);

			const res = await models.AutoAction.create({...autoAction, userId});
			return this.setNextActions(res, nextActions).then(() => this.getAutoAction(res.id)) as IAutoAction;
		}

		async encryptAutoActionIfNecessary(autoAction) {
			if (autoAction.isEncrypted && autoAction.funcArgs) {
				autoAction.funcArgsEncrypted = await app.encryptTextWithAppPass(autoAction.funcArgs);
				autoAction.funcArgs = "";
			}
			return autoAction;
		}

		async decryptAutoActionIfNecessary(autoAction) {
			if (autoAction.isEncrypted && autoAction.funcArgsEncrypted) {
				autoAction.funcArgs = await app.decryptTextWithAppPass(autoAction.funcArgsEncrypted);
			}
			return autoAction;
		}

		async addSerialAutoActions(userId, autoActions) {
			const resAutoActions = reverse(await pIteration.map(autoActions, (a) => this.addAutoAction(userId, a)));
			console.log('resAutoActions', resAutoActions.map(a => ({id: a.id, moduleName: a.moduleName, executeOn: a.executeOn})));

			let nextAction;
			await pIteration.forEachSeries(resAutoActions, async (a) => {
				if (nextAction) {
					await this.updateAutoAction(userId, a.id, { nextActions: [nextAction] })
				}
				nextAction = a;
			});
			return resAutoActions;
		}

		async getNextActionsToStore(userId, _nextActions) {
			let resNextActions;
			if (_nextActions) {
				resNextActions = await models.AutoAction.findAll({ where: {id: {[Op.in]: _nextActions.map(a => a.id)} }});
				if (some(resNextActions, a => a.userId !== userId)) {
					throw new Error("next_action_user_dont_match");
				}
			}
			return resNextActions;
		}

		async setNextActions(action, nextActions) {
			if (!nextActions) {
				return null;
			}
			return action.setNextActions(await pIteration.map(nextActions, async (action, position) => {
				action.nextActions = {position};
				return action;
			}));
		}

		async updateAutoAction(userId, id, autoAction) {
			let nextActions;
			if (autoAction.nextActions) {
				nextActions = await this.getNextActionsToStore(userId, autoAction.nextActions)
			}

			const existAction = await models.AutoAction.findOne({where: {id}});
			if (existAction.userId !== userId) {
				throw new Error("userId_dont_match");
			}

			await this.encryptAutoActionIfNecessary(autoAction);

			await existAction.update({ ...autoAction, userId });

			if (nextActions) {
				return this.setNextActions(existAction, nextActions).then(() => this.getAutoAction(id)) as IAutoAction;
			} else {
				return this.getAutoAction(id);
			}
		}

		async getAutoAction(id) {
			return models.AutoAction.findOne({ where: { id }, include: [ {association: 'nextActions'} ] }).then(a => this.decryptAutoActionIfNecessary(a));
		}

		async getUserActions(userId, params = {}) {
			return {
				list: await models.AutoAction.findAll({ where: { ...params, userId }, include: [ {association: 'nextActions'}, {association: 'baseActions'} ] }).then(as => pIteration.map(as, a => this.decryptAutoActionIfNecessary(a)))
			}
		}

		async getAutoActionsToExecute() {
			return models.AutoAction.findAll({where: { executeOn: {[Op.lte]: new Date()}, isActive: true} }).then((actions) => pIteration.map(actions, a => this.decryptAutoActionIfNecessary(a)));
		}

		async getNextActionsById(userId, id) {
			const baseAction = await models.AutoAction.findOne({where: {id}});
			const nextActions = orderBy(
				await baseAction.getNextActions().then((actions) => pIteration.map(actions, a => this.decryptAutoActionIfNecessary(a))),
				[a => a.nextActionsPivot.position],
				['asc']
			);
			console.log('getNextActionsById', id, 'nextActions.length', nextActions.length);
			return nextActions.map(a => {
				if (a.userId !== userId) {
					throw new Error("userId_dont_match");
				}
				return a;
			});
		}

		async updateAutoActionExecuteOn(userId, id, extendData: IAutoAction = {}) {
			const existAction = await models.AutoAction.findOne({where: {id}});
			if (!existAction || !existAction.executePeriod || !existAction.isActive) {
				return; // nothing to update
			}
			if (existAction.userId !== userId) {
				throw new Error("userId_dont_match");
			}
			await existAction.update({
				...extendData,
				executeOn: commonHelpers.moveDate(existAction.executePeriod, 'seconds')
			});
		}

		async deactivateAutoActionWithError(_userId, _actionId, _error, _rootActionId?) {
			let {userId} = await models.AutoAction.findOne({where: {id: _actionId}});
			if (_userId !== userId) {
				throw new Error("userId_dont_match");
			}
			await models.AutoActionLog.create({
				userId,
				isFailed: true,
				actionId: _actionId,
				rootActionId: _rootActionId,
				error: JSON.stringify(_error.message.toString())
			});
			return this.updateAutoActionExecuteOn(userId, _actionId, { isActive: false });
		}

		async handleAutoActionSuccessfulExecution(_userId, _actionId, _response, _rootActionId?) {
			let {totalExecuteAttempts, userId} = await models.AutoAction.findOne({where: {id: _actionId}});
			if (_userId !== userId) {
				throw new Error("userId_dont_match");
			}

			await models.AutoActionLog.create({
				userId,
				actionId: _actionId,
				rootActionId: _rootActionId,
				response: JSON.stringify(_response)
			});
			return this.updateAutoActionExecuteOn(userId, _actionId, {
				currentExecuteAttempts: totalExecuteAttempts
			})
		}

		async handleAutoActionFailedExecution(_userId, _actionId, _error, _rootActionId?) {
			let {currentExecuteAttempts, userId} = await models.AutoAction.findOne({where: {id: _actionId}});
			if (_userId !== userId) {
				throw new Error("userId_dont_match");
			}

			await models.AutoActionLog.create({
				userId,
				isFailed: true,
				actionId: _actionId,
				rootActionId: _rootActionId,
				error: JSON.stringify(_error.message.toString())
			});
			currentExecuteAttempts--;
			if (currentExecuteAttempts > 0) {
				return this.updateAutoActionExecuteOn(userId, _actionId, { currentExecuteAttempts });
			} else {
				return this.updateAutoAction(userId, _actionId, { currentExecuteAttempts, isActive: false });
			}
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['NextActionsPivot', 'AutoActionLog', 'AutoAction'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new AutoActionsModule();
}