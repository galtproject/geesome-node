import {IUserOperationQueue} from "../database/interface";

export default interface IGeesomeStaticSiteManagerModule {
	moduleName: string;

	getDefaultOptionsByGroupId(groupId?): Promise<{
		baseStorageUri,
		lang,
		dateFormat,
		post: { titleLength, descriptionLength },
		postList: { postsPerPage },
		site: { title, username, description, avatarUrl, postsCount, base }
	}>;

	addRenderToQueueAndProcess(userId, apiKey, type, id, options): Promise<IUserOperationQueue>;
}