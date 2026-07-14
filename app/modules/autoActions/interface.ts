export default interface IGeesomeAutoActionsModule {
	stop(): Promise<void>;

	addSerialAutoActions(userId: number, autoActions: IAutoAction[]): Promise<IAutoAction[]>;

	addAutoAction(userId: number, autoAction: IAutoAction): Promise<IAutoAction>;

	updateAutoAction(userId: number, id: number, autoAction: IAutoAction): Promise<IAutoAction>;

	getAutoActionsToExecute(): Promise<IAutoAction[]>;

	claimAutoActionsToExecute(options?: IAutoActionClaimOptions): Promise<IAutoAction[]>;

	getUserActions(userId: number, params?): Promise<IAutoActionListResponse>;

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
	funcArgsEncrypted?: string;
	lastError?: string;
	isActive?: boolean;
	runPeriod?: number;
	executePeriod?: number;
	position?: number;
	nextActions?: IAutoAction[];
	totalExecuteAttempts?: number;
	currentExecuteAttempts?: number;
	executeOn?: Date;
	executeClaimedAt?: Date;
	executeClaimExpiresAt?: Date;
}

export interface IAutoActionClaimOptions {
	now?: Date;
	claimTtlMs?: number;
}

export interface IAutoActionListResponse {
	list: IAutoAction[];
	total: number;
}
