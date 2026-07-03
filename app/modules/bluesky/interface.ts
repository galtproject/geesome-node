import {IBlueskyPostProjection} from './helpers.js';

export interface IBlueskyPublicAuthorFeedPreviewInput {
	actor?: string;
	cursor?: string;
	limit?: number;
}

export interface IBlueskyPublicAuthorFeedPreview {
	actor: string;
	cursor: string | null;
	list: IBlueskyPostProjection[];
}

export default interface IGeesomeBlueskyModule {
	getPublicAuthorFeedPreview(input?: IBlueskyPublicAuthorFeedPreviewInput): Promise<IBlueskyPublicAuthorFeedPreview>;
}
