import IGeesomeAutoActionsModule, {IAutoAction} from "./interface";
import {IGeesomeApp} from "../../interface";
const pIteration = require('p-iteration');
const _ = require('lodash');

export default class CronService {
	queueByModules = {};
	prevActionsResultByRootId = {};
	actionsIdsByRootId = {};
	app: IGeesomeApp;
	autoActionsModule: IGeesomeAutoActionsModule;

	constructor(_app, _autoActionsModule) {
		this.app = _app;
		this.autoActionsModule = _autoActionsModule;
	}

	async getActionsAndAddToQueue() {
		await this.addActionsListToQueue(await this.autoActionsModule.getAutoActionsToExecute());
	}

	addActionsListToQueue(actions: IAutoAction[], rootActionId = null) {
		if (rootActionId && !this.actionsIdsByRootId[rootActionId]) {
			this.actionsIdsByRootId[rootActionId] = [];
		}

		let inProcessByModules = {};
		actions.forEach(a => {
			if (_.isUndefined(inProcessByModules[a.moduleName])) {
				inProcessByModules[a.moduleName] = this.queueByModules[a.moduleName] && this.queueByModules[a.moduleName].length;
				if (!inProcessByModules[a.moduleName]) {
					this.queueByModules[a.moduleName] = [];
				}
			}
			this.queueByModules[a.moduleName].push(a);
			if (rootActionId) {
				this.actionsIdsByRootId[rootActionId].push(a.id);
			}
		});
		Object.keys(this.queueByModules).forEach(moduleName => {
			this.queueByModules[moduleName] = _.uniqBy(this.queueByModules[moduleName], a => a.id);
			if (!inProcessByModules[moduleName]) {
				this.runQueueByModule(moduleName, rootActionId);
			}
		});
	}

	async runQueueByModule(moduleName, rootActionId = null) {
		while (this.queueByModules[moduleName].length) {
			let parallelCount = 1;
			if (this.queueByModules[moduleName].parallelAutoActionsCount) {
				parallelCount = this.queueByModules[moduleName].parallelAutoActionsCount();
			}
			const actionsToParallelExecute = this.queueByModules[moduleName].slice(0, parallelCount);
			await pIteration.forEach(actionsToParallelExecute, a => this.executeActionAndAddNextToQueue(a, rootActionId));
		}
	}


	async executeActionAndAddNextToQueue(a: IAutoAction, rootActionId = null) {
		const {result, success} = await this.executeAction(a, rootActionId);
		if (!success) {
			this.clearPrevActions(a.id, rootActionId);
			return;
		}
		if (!rootActionId) {
			rootActionId = a.id;
		}
		if (!this.prevActionsResultByRootId[rootActionId]) {
			this.prevActionsResultByRootId[rootActionId] = {};
		}
		this.prevActionsResultByRootId[rootActionId][a.moduleName + '.' + a.funcName] = result;

		this.addActionsListToQueue(await this.autoActionsModule.getNextActionsById(a.userId, a.id), rootActionId);

		this.clearPrevActions(a.id, rootActionId);
	}

	clearPrevActions(actionId, rootActionId) {
		if (rootActionId) {
			const index = this.actionsIdsByRootId[rootActionId].indexOf(actionId);
			if (index !== -1) {
				this.actionsIdsByRootId[rootActionId].splice(index, 1);
			}
			if (!this.actionsIdsByRootId[rootActionId].length) {
				delete this.prevActionsResultByRootId[rootActionId]
			}
		}
	}

	async executeAction(a: IAutoAction, rootActionId = null): Promise<{result?, success}> {
		const module = this.app.ms[a.moduleName];
		if (!module.isAutoActionAllowed) {
			await this.autoActionsModule.deactivateAutoActionWithError(a.userId, a.id, new Error('module_dont_support_auto_actions'), rootActionId);
			return {success: false};
		}
		if (!(await module.isAutoActionAllowed(a.userId, a.funcName, a.funcArgs))) {
			await this.autoActionsModule.deactivateAutoActionWithError(a.userId, a.id, new Error('auto_action_not_allowed_in_module'), rootActionId);
			return {success: false};
		}
		let funcArgs;
		try {
			funcArgs = JSON.parse(a.funcArgs);
			if (!_.isArray(funcArgs)) {
				throw new Error("funcArgs_not_array");
			}
		} catch (e) {
			await this.autoActionsModule.deactivateAutoActionWithError(a.userId, a.id, new Error('funcArgs_parsing_error'), rootActionId);
			return {success: false};
		}

		let result;
		try {
			funcArgs = funcArgs.map(arg => {
				if (rootActionId && _.isString(arg) && this.prevActionsResultByRootId[rootActionId] && this.prevActionsResultByRootId[rootActionId][arg]) {
					return this.prevActionsResultByRootId[rootActionId][arg];
				}
				return arg;
			})
			result = await module[a.funcName].apply(module, [a.userId].concat(funcArgs));
			await this.autoActionsModule.handleAutoActionSuccessfulExecution(a.userId, a.id, result, rootActionId);
		} catch (error) {
			await this.autoActionsModule.handleAutoActionFailedExecution(a.userId, a.id, error, rootActionId);
			return {success: false};
		}
		return {success: true, result};
	}
}