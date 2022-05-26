import {IUser, IUserApiKey} from "../database/interface";
import {Stream} from "stream";

export default interface IGeesomeApiModule {
	port;

	onGet(routeName: string, callback: (IApiModuleGetInput, IApiModuleCommonOutput) => any): any;

	onUnversionGet(routeName: string, callback: (IApiModuleGetInput, IApiModuleCommonOutput) => any): any;

	onHead(routeName: string, callback: (IApiModuleGetInput, IApiModuleCommonOutput) => any): any;

	onUnversionHead(routeName: string, callback: (IApiModuleGetInput, IApiModuleCommonOutput) => any): any;

	onPost(routeName: string, callback: (IApiModulePotInput, IApiModuleCommonOutput) => any): any;

	onAuthorizedGet(routeName: string, callback: (IApiModuleGetInput, IApiModuleCommonOutput) => any): any;

	onAuthorizedPost(routeName: string, callback: (IApiModulePotInput, IApiModuleCommonOutput) => any): any;

	handleAuthResult(IApiModuleCommonOutput, user: IUser): Promise<any>;

	setDefaultHeaders(res: IApiModuleCommonOutput): void;

	setStorageHeaders(res: IApiModuleCommonOutput): void;

	prefix(routePrefix: string): IGeesomeApiModule;

	stop(): any;
}

export interface IApiModuleCommonOutput {
	send: (data: any, status?: number) => any;
	setHeader: (name: string, value: string) => any;
	writeHead: (status: number, data: any) => any;
	stream: Stream;
}

export interface IApiModuleCommonInput {
	params: any;
	route: string;
	fullRoute: string;
	headers: any;
	token?: string;
	user?: IUser;
	apiKey?: IUserApiKey;
	query?: any;
	stream: Stream;
}

export interface IApiModuleGetInput extends IApiModuleCommonInput {

}

export interface IApiModulePotInput extends IApiModuleCommonInput {
	body?: any;
}