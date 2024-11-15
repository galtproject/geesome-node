import {IUserOperationQueue} from "../asyncOperation/interface.js";
import {IListParams} from "../database/interface.js";

export interface IStaticSiteRenderArgs {
	entityType: string;
	entityId?: string | number;
	entityIds?: any[];
}
export interface IStaticSiteOptions {
	baseStorageUri?;
	lang;
	dateFormat;
	post: { titleLength, descriptionLength };
	postList: { postsPerPage };
	site: { title, name, username, description, avatarUrl?, postsCount?, base };
}

export default interface IGeesomeStaticSiteGeneratorModule {
	moduleName: string;

	getDefaultOptionsByGroupId(userId: number, groupId: number): Promise<IStaticSiteOptions>;

	getDefaultOptionsByRenderArgs(userId: number, renderArgs: IStaticSiteRenderArgs): Promise<IStaticSiteOptions>;

	addRenderToQueueAndProcess(userId: number, apiKeyId: number, renderArgs: IStaticSiteRenderArgs, options: any): Promise<IUserOperationQueue>;

	getStaticSiteInfo(userId: number, renderArgs: IStaticSiteRenderArgs): Promise<IStaticSite>;

	getStaticSiteList(userId: number, entityType?: string, listParams?: IListParams): Promise<IStaticSite[]>;

	bindSiteToStaticId(userId: number, staticSiteId: number): Promise<any>;

	updateStaticSiteInfo(userId: number, staticSiteId: number, updateData: any): Promise<any>;

	generateGroupSite(userId: number, renderArgs: IStaticSiteRenderArgs, options?: any): Promise<string>;

	generateContentListSite(userId: number, renderArgs: IStaticSiteRenderArgs, options?: any): Promise<{storageId, staticSiteId}>;
}

export interface IStaticSite {
	id?: number;
	name: string;
	title: string;
	options: string;
	entityType: string;
	entityId: number;
	storageId: string;
	staticId: string;
}