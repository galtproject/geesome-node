export default interface IGeesomeRssModule {
	getRssGroupUrl(groupId?): string;
	groupRss(groupId, host, forUserId?, options?: IRssGroupOptions): Promise<string>;
}

export interface IRssGroupOptions {
	limit?: number | string;
}
