import {IUserOperationQueue} from "../asyncOperation/interface";

export default interface IGeesomeStaticSiteGeneratorModule {
	moduleName: string;

	getDefaultOptionsByGroupId(userId, groupId?): Promise<{
		baseStorageUri?,
		lang,
		dateFormat,
		post: { titleLength, descriptionLength },
		postList: { postsPerPage },
		site: { title, name, username, description, avatarUrl?, postsCount?, base }
	}>;

	addRenderToQueueAndProcess(userId, apiKeyId, renderData: {entityType, entityId?, entityIds?}, options): Promise<IUserOperationQueue>;

	bindSiteToStaticId(userId, staticSiteId): Promise<any>;

	getStaticSiteInfo(userId, type, entityId): Promise<IStaticSite>;

	updateStaticSiteInfo(userId, staticSiteId, updateData): Promise<any>;

	generateGroupSite(userId, entityType, entityId, options: any = {}): Promise<string>;
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