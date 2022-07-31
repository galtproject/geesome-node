import {IUserOperationQueue} from "../asyncOperation/interface";

export default interface IGeesomeStaticSiteGeneratorModule {
	moduleName: string;

	getDefaultOptionsByGroupId(userId, groupId?): Promise<{
		baseStorageUri,
		lang,
		dateFormat,
		post: { titleLength, descriptionLength },
		postList: { postsPerPage },
		site: { title, username, description, avatarUrl, postsCount, base }
	}>;

	addRenderToQueueAndProcess(userId, apiKey, type, id, options): Promise<IUserOperationQueue>;

	bindSiteToStaticId(userId, staticSiteId): Promise<any>;

	getStaticSiteInfo(userId, type, entityId): Promise<IStaticSite>;

	updateStaticSiteInfo(userId, staticSiteId, updateData): Promise<any>;
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