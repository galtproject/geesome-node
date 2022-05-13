import {IGeesomeApp} from "../../interface";
import IGeesomeAutoActionsModule, {IAutoAction} from "./interface";

const Op = require("sequelize").Op;
const pIteration = require("p-iteration");
const some = require("lodash/some");
const commonHelpers = require('geesome-libs/src/common');
const orderBy = require("lodash/orderBy");
const reverse = require("lodash/reverse");

module.exports = async (app: IGeesomeApp, options: any = {}) => {
	const models = await require("./models")();
	const module = await getModule(app, models);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {

	class AutoActionsModule implements IGeesomeAutoActionsModule {
		async addAutoAction(userId, autoAction) {
			console.log('addAutoAction', autoAction);
			const nextActions = await this.getNextActionsToStore(userId, autoAction.nextActions)
			const res = await models.AutoAction.create({...autoAction, userId});
			console.log('res', res.id);
			return this.setNextActions(res, nextActions).then(() => this.getAutoAction(res.id)) as IAutoAction;
		}

		async addSerialAutoActions(userId, autoActions) {
			const resAutoActions = reverse(await pIteration.map(autoActions, (a) => this.addAutoAction(userId, a)));
			console.log('resAutoActions', resAutoActions.map(a => a.moduleName));

			let nextAction;
			await pIteration.forEach(resAutoActions, async (a) => {
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
				resNextActions = await models.AutoAction.findAll({ id: {[Op.in]: _nextActions.map(a => a.id)} });
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
			console.log('updateAutoAction', id, autoAction);
			let nextActions;
			if (autoAction.nextActions) {
				nextActions = await this.getNextActionsToStore(userId, autoAction.nextActions)
			}

			const existAction = await models.AutoAction.findOne({where: {id}});
			if (existAction.userId !== userId) {
				throw new Error("userId_dont_match");
			}
			await existAction.update({ ...autoAction, userId });

			if (nextActions) {
				return this.setNextActions(existAction, nextActions).then(() => this.getAutoAction(id)) as IAutoAction;
			} else {
				return this.getAutoAction(id);
			}
		}

		async getAutoAction(id) {
			return models.AutoAction.findOne({ where: { id }, include: [ {association: 'nextActions'} ] });
		}

		async getAutoActionsToExecute() {
			return models.AutoAction.findAll({where: { executeOn: {[Op.gte]: new Date()}, isActive: true} });
		}

		async getNextActionsById(userId, id) {
			const nextActions = orderBy(
				(await models.AutoAction.findOne({where: {id}})).getNextActions(),
				[a => a.nextActions.position],
				['asc']
			);
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