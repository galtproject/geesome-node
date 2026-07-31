import helpers from "../../helpers.js";
import {IApiModuleCommonOutput} from "./interface.js";
import {ApiProblemError, sendApiProblem} from './problem.js';

type DebugLog = {
	enabled: boolean;
	(...args: any[]): void;
};

export function sendBadRequestOnContentRouteError(log: DebugLog, res: IApiModuleCommonOutput, getContext: () => any = () => ({})) {
	return (error) => {
		helpers.logDebug(log, () => [
			'content route request failed',
			{
				...getContext(),
				error: getErrorMessage(error)
			}
		]);
		sendApiProblem(res, new ApiProblemError(400, 'content_request_invalid', 'Invalid content request', 'The content path or request options are invalid.'));
	};
}

export function sendForbiddenOnAuthRouteError(log: DebugLog, res: IApiModuleCommonOutput, getContext: () => any = () => ({})) {
	return (error) => {
		helpers.logDebug(log, () => [
			'auth route request failed',
			{
				...getContext(),
				error: getErrorMessage(error)
			}
		]);
		sendApiProblem(res, new ApiProblemError(403, 'forbidden', 'Forbidden', 'The authenticated principal is not allowed to perform this action.'));
	};
}

export function sendBadGatewayOnStorageRouteError(log: DebugLog, res: IApiModuleCommonOutput, getContext: () => any = () => ({})) {
	return (error) => {
		helpers.logDebug(log, () => [
			'storage route request failed',
			{
				...getContext(),
				error: getErrorMessage(error)
			}
		]);
		sendApiProblem(res, new ApiProblemError(502, 'storage_backend_unavailable', 'Storage backend unavailable', 'The storage backend did not complete the request.'));
	};
}

function getErrorMessage(error) {
	if (error && error.message) {
		return error.message;
	}
	return String(error);
}
