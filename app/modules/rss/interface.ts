export default interface IGeesomeRssModule {
	getRssGroupUrl(groupId?): string;
	groupRss(groupId, host, forUserId?): Promise<string>;
}