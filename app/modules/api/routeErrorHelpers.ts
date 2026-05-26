import helpers from "../../helpers.js";
import {IApiModuleCommonOutput} from "./interface.js";

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
		res.send(400);
	};
}

function getErrorMessage(error) {
	if (error && error.message) {
		return error.message;
	}
	return String(error);
}
