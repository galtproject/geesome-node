export default interface IGeesomeAutoActionsModule {
	addSerialAutoActions(userId: number, autoActions: IAutoAction[]): Promise<IAutoAction[]>;

	addAutoAction(userId: number, autoAction: IAutoAction): Promise<IAutoAction>;

	updateAutoAction(userId: number, id: number, autoAction: IAutoAction): Promise<IAutoAction>;

	getAutoActionsToExecute(): Promise<IAutoAction[]>;

	getUserActions(userId: number): Promise<{list: IAutoAction[]}>;

	getNextActionsById(userId, id): Promise<IAutoAction[]>;

	updateAutoActionExecuteOn(userId, id, extendData?: IAutoAction): Promise<any>;

	deactivateAutoActionWithError(userId, id, error, rootActionId?): Promise<any>;

	handleAutoActionSuccessfulExecution(userId, id, response, rootActionId?): Promise<any>;

	handleAutoActionFailedExecution(userId, id, error, rootActionId?): Promise<any>;
}

export interface IAutoAction {
	id?: number;
	userId?: number;
	moduleName?: string;
	funcName?: string;
	funcArgs?: string; // JSON
	lastError?: string;
	isActive?: boolean;
	runPeriod?: number;
	position?: number;
	nextActions?: IAutoAction[];
	totalExecuteAttempts?: number;
	currentExecuteAttempts?: number;
}