import _ from 'lodash';
import debug from 'debug';
import {Op} from "sequelize";
import pIteration from 'p-iteration';
import commonHelper from "geesome-libs/src/common.js";
import IGeesomeAutoActionsModule, {IAutoAction, IAutoActionClaimOptions} from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import {IListParamsOptions} from "../database/interface.js";
import helpers from "../../helpers.js";
const {some, orderBy, reverse} = _;
const log = debug('geesome:app:autoActions');
const autoActionExecuteBatchLimit = 100;
const defaultAutoActionClaimTtlMs = 5 * 60 * 1000;
const autoActionClaimTtlMs = parsePositiveNumber(process.env.AUTO_ACTION_CLAIM_TTL_MS, defaultAutoActionClaimTtlMs);
const autoActionListParams: IListParamsOptions = {
	sortBy: 'createdAt',
	allowedSortBy: ['createdAt', 'updatedAt', 'id', 'moduleName', 'funcName', 'executeOn', 'isActive'],
	maxLimit: 100
};
const autoActionListFilterTypes = {
	moduleName: 'string',
	funcName: 'string',
	isActive: 'boolean'
} as const;

function parsePositiveNumber(value, fallback) {
	const parsed = Number.parseInt(value as any, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAutoActionListWhere(userId, params = {}) {
	const where = helpers.prepareWhereParams(params, autoActionListFilterTypes);
	return {...where, userId};
}

function getDueAutoActionWhere(now: Date, executionClaimsSupported: boolean) {
	const where = {
		executeOn: {[Op.lte]: now},
		isActive: true,
	} as any;

	if (executionClaimsSupported) {
		where[Op.or] = [
			{executeClaimExpiresAt: null},
			{executeClaimExpiresAt: {[Op.lte]: now}},
		];
	}

	return where;
}

function getAutoActionClaimExpiresAt(now: Date, options: IAutoActionClaimOptions) {
	const claimTtlMs = typeof options.claimTtlMs === 'number' && Number.isFinite(options.claimTtlMs) && options.claimTtlMs > 0
		? options.claimTtlMs
		: autoActionClaimTtlMs;

	return new Date(now.getTime() + claimTtlMs);
}

function getAutoActionClaimReleaseData(executionClaimsSupported: boolean) {
	if (!executionClaimsSupported) {
		return {};
	}
	return {
		executeClaimedAt: null,
		executeClaimExpiresAt: null,
	};
}

export default async (app: IGeesomeApp) => {
	const models = await (await import("./models.js")).default(app.ms.database.sequelize);
	const module = await getModule(app, models);
	(await import('./api.js')).default(app, module);
	(await import('./cron.js')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	const executionClaimsSupported = models.autoActionExecutionClaimsSupported === true;

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
			log('resAutoActions', resAutoActions.map(a => ({id: a.id, moduleName: a.moduleName, executeOn: a.executeOn})));

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
			return action.setNextActions(await pIteration.map(nextActions, async (action: IAutoAction, position) => {
				action.nextActions = {position} as any;
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
			const listParams = helpers.prepareListParams(params, autoActionListParams);
			app.ms.database.setDefaultListParamsValues(listParams, autoActionListParams);
			const {limit, offset, sortBy, sortDir} = listParams;
			const where = getAutoActionListWhere(userId, params);
			const order = sortBy === 'id'
				? [[sortBy, sortDir.toUpperCase()]]
				: [[sortBy, sortDir.toUpperCase()], ['id', sortDir.toUpperCase()]];

			return {
				list: await models.AutoAction.findAll({
					where,
					include: [ {association: 'nextActions'}, {association: 'baseActions'} ],
					order,
					limit,
					offset
				}).then(as => pIteration.map(as, a => this.decryptAutoActionIfNecessary(a))),
				total: await models.AutoAction.count({where})
			}
		}

		async getAutoActionsToExecute() {
			const now = new Date();

			return models.AutoAction.findAll({
				where: getDueAutoActionWhere(now, executionClaimsSupported),
				order: [['executeOn', 'ASC'], ['id', 'ASC']],
				limit: autoActionExecuteBatchLimit
			}).then((actions) => pIteration.map(actions, a => this.decryptAutoActionIfNecessary(a)));
		}

		async claimAutoActionsToExecute(options: IAutoActionClaimOptions = {}) {
			if (!executionClaimsSupported) {
				return this.getAutoActionsToExecute();
			}
			const now = options.now || new Date();
			const claimExpiresAt = getAutoActionClaimExpiresAt(now, options);
			const actions = await models.AutoAction.claimDueForExecution({
				now,
				claimExpiresAt,
				limit: autoActionExecuteBatchLimit
			});
			const orderedActions = orderBy(actions, ['executeOn', 'id'], ['asc', 'asc']);

			return pIteration.map(orderedActions, a => this.decryptAutoActionIfNecessary(a));
		}

		async getNextActionsById(userId, id) {
			const baseAction = await models.AutoAction.findOne({where: {id}});
			const nextActions = orderBy(
				await baseAction.getNextActions().then((actions) => pIteration.map(actions, a => this.decryptAutoActionIfNecessary(a))),
				[a => a.nextActionsPivot.position],
				['asc']
			);
			log('getNextActionsById', id, 'nextActions.length', nextActions.length);
			return nextActions.map(a => {
				if (a.userId !== userId) {
					throw new Error("userId_dont_match");
				}
				return a;
			});
		}

		async updateAutoActionExecuteOn(userId, id, extendData: IAutoAction = {}) {
			const existAction = await models.AutoAction.findOne({where: {id}});
			if (!existAction) {
				return; // nothing to update
			}
			if (existAction.userId !== userId) {
				throw new Error("userId_dont_match");
			}
			const updateData = {
				...extendData,
				...getAutoActionClaimReleaseData(executionClaimsSupported)
			};
			if (!existAction.executePeriod || !existAction.isActive) {
				return existAction.update(updateData);
			}
			await existAction.update({
				...updateData,
				executeOn: commonHelper.moveDate(existAction.executePeriod, 'seconds')
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
