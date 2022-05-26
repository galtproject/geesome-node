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

	bindSiteToStaticId(userId, type, entityId, name): Promise<any>;

	getStaticSiteInfo(userId, type, entityId): Promise<IStaticSite>;
}

export interface IStaticSite {
	name: string;
	title: string;
	options: string;
	type: string;
	entityId: number;
	storageId: string;
	staticId: string;
}