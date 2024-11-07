import _ from 'lodash';
import pIteration from 'p-iteration';
import IGeesomeAutoActionsModule, {IAutoAction} from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
const {some, uniqBy, isArray, isString} = _;

export default class CronService {
	queueByModules = {};
	inProcessByModules = {};
	prevActionsResultByRootId = {};
	actionsIdsByRootId = {};
	app: IGeesomeApp;
	autoActionsModule: IGeesomeAutoActionsModule;

	constructor(_app, _autoActionsModule) {
		this.app = _app;
		this.autoActionsModule = _autoActionsModule;
	}

	async getActionsAndAddToQueue() {
		return this.addActionsListToQueue(await this.autoActionsModule.getAutoActionsToExecute());
	}

	async getActionsAndAddToQueueAndRun() {
		return this.addActionsListToQueueAndRun(await this.autoActionsModule.getAutoActionsToExecute());
	}

	addActionsListToQueue(actions: IAutoAction[], rootActionId = null) {
		if (rootActionId && !this.actionsIdsByRootId[rootActionId]) {
			this.actionsIdsByRootId[rootActionId] = [];
		}
		actions.forEach(a => {
			if(!this.queueByModules[a.moduleName]) {
				this.queueByModules[a.moduleName] = []
			}
			if (!some(this.queueByModules[a.moduleName], _a => _a.id === a.id)) {
				this.queueByModules[a.moduleName].push(a);
				if (rootActionId) {
					this.actionsIdsByRootId[rootActionId].push(a.id);
				}
			}
		});
	}

	addActionsListToQueueAndRun(actions: IAutoAction[], rootActionId = null) {
		this.addActionsListToQueue(actions, rootActionId);

		const promises = [];
		Object.keys(this.queueByModules).forEach(moduleName => {
			if (!this.inProcessByModules[moduleName]) {
				promises.push(this.runQueueByModule(moduleName, rootActionId));
			}
		});
		return Promise.all(promises);
	}

	async runQueueByModule(moduleName, rootActionId = null): Promise<IAutoAction[]> {
		this.inProcessByModules[moduleName] = true;
		let executedActions = [];
		while (this.queueByModules[moduleName].length) {
			let parallelCount = 1;
			if (this.queueByModules[moduleName].parallelAutoActionsCount) {
				parallelCount = this.queueByModules[moduleName].parallelAutoActionsCount();
			}
			const actionsToParallelExecute = uniqBy(this.queueByModules[moduleName].splice(0, parallelCount), (a: any) => a.id);
			await pIteration.forEach(actionsToParallelExecute, a => this.executeActionAndAddNextToQueue(a, rootActionId));
			executedActions = executedActions.concat(actionsToParallelExecute);
		}
		this.inProcessByModules[moduleName] = false;
		return executedActions;
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
		this.prevActionsResultByRootId[rootActionId][this.getPrevActionDictName(a)] = result;

		this.addActionsListToQueueAndRun(await this.autoActionsModule.getNextActionsById(a.userId, a.id), rootActionId);

		this.clearPrevActions(a.id, rootActionId);
	}

	getPrevActionDictName(a) {
		return '{{' + a.moduleName + '.' + a.funcName + '}}';
	}

	clearPrevActions(actionId, rootActionId) {
		if (rootActionId) {
			const index = this.actionsIdsByRootId[rootActionId].indexOf(actionId);
			if (index !== -1) {
				this.actionsIdsByRootId[rootActionId].splice(index, 1);
			}
			if (!this.actionsIdsByRootId[rootActionId].length) {
				delete this.prevActionsResultByRootId[rootActionId];
				delete this.actionsIdsByRootId[rootActionId];
			}
		}
	}

	async executeAction(a: IAutoAction, rootActionId = null): Promise<{result?, success}> {
		const module = this.app.ms[a.moduleName];
		if (!module || !module.isAutoActionAllowed) {
			console.error('executeAction', a.id, 'module_dont_support_auto_actions');
			await this.autoActionsModule.deactivateAutoActionWithError(a.userId, a.id, new Error('module_dont_support_auto_actions'), rootActionId);
			return {success: false};
		}
		if (!(await module.isAutoActionAllowed(a.userId, a.funcName, a.funcArgs))) {
			console.error('executeAction', a.id, 'auto_action_not_allowed_in_module');
			await this.autoActionsModule.deactivateAutoActionWithError(a.userId, a.id, new Error('auto_action_not_allowed_in_module'), rootActionId);
			return {success: false};
		}
		let funcArgs;
		try {
			funcArgs = JSON.parse(a.funcArgs);
			if (!isArray(funcArgs)) {
				throw new Error("funcArgs_not_array");
			}
		} catch (e) {
			console.error('executeAction', a.id, 'funcArgs_parsing_error', e);
			await this.autoActionsModule.deactivateAutoActionWithError(a.userId, a.id, new Error('funcArgs_parsing_error'), rootActionId);
			return {success: false};
		}

		let result;
		try {
			funcArgs = funcArgs.map(arg => {
				if (rootActionId && isString(arg) && this.prevActionsResultByRootId[rootActionId] && this.prevActionsResultByRootId[rootActionId][arg]) {
					return this.prevActionsResultByRootId[rootActionId][arg];
				}
				return arg;
			})
			result = await module[a.funcName].apply(module, [a.userId].concat(funcArgs));
			await this.autoActionsModule.handleAutoActionSuccessfulExecution(a.userId, a.id, result, rootActionId);
		} catch (error) {
			console.error('executeAction', a.id, 'execute error', error);
			await this.autoActionsModule.handleAutoActionFailedExecution(a.userId, a.id, error, rootActionId);
			return {success: false};
		}
		return {success: true, result};
	}
}