import type {IContentData} from '../database/interface.js';
import {GroupType, PostStatus} from '../group/interface.js';
import type {IGroup, IPost} from '../group/interface.js';
import {RICH_TEXT_MIME_TYPE, isRichTextDocument, richTextToSafeHtml} from '../../richText.js';
import {
	activityPubContext,
	activityPubPublicCollection,
	getActivityPubGroupActorUrls,
	getActivityPubGroupPostObjectUrl
} from './helpers.js';
import type {
	IActivityPubAcceptActivity,
	IActivityPubActorObject,
	IActivityPubActorOptions,
	IActivityPubConfig,
	IActivityPubCreateActivity,
	IActivityPubFollowActivity,
	IActivityPubFollowActivityOptions,
	IActivityPubFollowAcceptOptions,
	IActivityPubFollowersCollection,
	IActivityPubFollowersCollectionOptions,
	IActivityPubFollowingCollection,
	IActivityPubNoteObject,
	IActivityPubOutboxCollection,
	IActivityPubOutboxOptions,
	IActivityPubPostSerializerOptions
} from './interface.js';

export function buildActivityPubGroupActor(config: IActivityPubConfig, group: IGroup, options: IActivityPubActorOptions = {}): IActivityPubActorObject {
	assertActivityPubGroupFederatable(group);
	const urls = getActivityPubGroupActorUrls(config, group);
	const actor: IActivityPubActorObject = {
		'@context': activityPubContext,
		id: urls.actorUrl,
		type: 'Group',
		preferredUsername: group.name,
		name: group.title || group.name,
		summary: group.description || '',
		url: group.homePage || urls.actorUrl,
		inbox: urls.inboxUrl,
		outbox: urls.outboxUrl,
		followers: urls.followersUrl,
		following: urls.followingUrl,
		manuallyApprovesFollowers: group.isOpen === false,
		discoverable: true,
		endpoints: {
			sharedInbox: urls.sharedInboxUrl
		}
	};

	const icon = buildActivityPubImageLink(group.avatarImage);
	if (icon) {
		actor.icon = icon;
	}
	const image = buildActivityPubImageLink(group.coverImage);
	if (image) {
		actor.image = image;
	}
	if (options.publicKeyPem) {
		actor.publicKey = {
			id: `${urls.actorUrl}#main-key`,
			owner: urls.actorUrl,
			publicKeyPem: options.publicKeyPem
		};
	}

	return actor;
}

export function buildActivityPubPostNote(config: IActivityPubConfig, group: IGroup, post: IPost, options: IActivityPubPostSerializerOptions = {}): IActivityPubNoteObject {
	assertActivityPubPostFederatable(group, post);
	const urls = getActivityPubGroupActorUrls(config, group);
	const objectUrl = getActivityPubGroupPostObjectUrl(config, group, post.localId);
	const contents = options.contents || [];

	return {
		'@context': activityPubContext,
		id: objectUrl,
		type: 'Note',
		attributedTo: urls.actorUrl,
		to: [activityPubPublicCollection],
		cc: [urls.followersUrl],
		content: getActivityPubPostContent(contents),
		url: objectUrl,
		published: toActivityPubDate(post.publishedAt),
		attachment: buildActivityPubAttachments(contents)
	};
}

export function buildActivityPubPostCreateActivity(config: IActivityPubConfig, group: IGroup, post: IPost, options: IActivityPubPostSerializerOptions = {}): IActivityPubCreateActivity {
	const urls = getActivityPubGroupActorUrls(config, group);
	const object = buildActivityPubPostNote(config, group, post, options);

	return {
		'@context': activityPubContext,
		id: `${object.id}/activity/create`,
		type: 'Create',
		actor: urls.actorUrl,
		to: object.to,
		cc: object.cc,
		published: object.published,
		object
	};
}

export function buildActivityPubFollowActivity(config: IActivityPubConfig, group: IGroup, remoteActorUrl: string, options: IActivityPubFollowActivityOptions): IActivityPubFollowActivity {
	assertActivityPubGroupFederatable(group);
	const urls = getActivityPubGroupActorUrls(config, group);

	return {
		'@context': activityPubContext,
		id: options.activityId,
		type: 'Follow',
		actor: urls.actorUrl,
		object: remoteActorUrl
	};
}

export function buildActivityPubFollowAcceptActivity(config: IActivityPubConfig, group: IGroup, followActivity: any, options: IActivityPubFollowAcceptOptions): IActivityPubAcceptActivity {
	assertActivityPubGroupFederatable(group);
	const urls = getActivityPubGroupActorUrls(config, group);

	return {
		'@context': activityPubContext,
		id: options.activityId,
		type: 'Accept',
		actor: urls.actorUrl,
		object: followActivity
	};
}

export function buildActivityPubOutboxCollection(config: IActivityPubConfig, group: IGroup, posts: IPost[] = [], options: IActivityPubOutboxOptions = {}): IActivityPubOutboxCollection {
	assertActivityPubGroupFederatable(group);
	const urls = getActivityPubGroupActorUrls(config, group);
	const orderedItems = posts
		.filter((post) => isActivityPubPostFederatable(group, post))
		.map((post) => buildActivityPubPostCreateActivity(config, group, post, {
			contents: getPostContents(options.contentsByPostId, post)
		}));

	return {
		'@context': activityPubContext,
		id: urls.outboxUrl,
		type: 'OrderedCollection',
		totalItems: orderedItems.length,
		orderedItems
	};
}

export function buildActivityPubFollowersCollection(config: IActivityPubConfig, group: IGroup, actorUrls: string[] = [], options: IActivityPubFollowersCollectionOptions = {}): IActivityPubFollowersCollection {
	assertActivityPubGroupFederatable(group);
	const urls = getActivityPubGroupActorUrls(config, group);

	return {
		'@context': activityPubContext,
		id: urls.followersUrl,
		type: 'OrderedCollection',
		totalItems: options.totalItems ?? actorUrls.length,
		orderedItems: actorUrls
	};
}

export function buildActivityPubFollowingCollection(config: IActivityPubConfig, group: IGroup, actorUrls: string[] = [], options: IActivityPubFollowersCollectionOptions = {}): IActivityPubFollowingCollection {
	assertActivityPubGroupFederatable(group);
	const urls = getActivityPubGroupActorUrls(config, group);

	return {
		'@context': activityPubContext,
		id: urls.followingUrl,
		type: 'OrderedCollection',
		totalItems: options.totalItems ?? actorUrls.length,
		orderedItems: actorUrls
	};
}

export function isActivityPubGroupFederatable(group: IGroup): boolean {
	return group?.isPublic === true
		&& group?.isEncrypted !== true
		&& group?.type !== GroupType.PersonalChat
		&& group?.isRemote !== true;
}

export function isActivityPubPostFederatable(group: IGroup, post: IPost): boolean {
	return isActivityPubGroupFederatable(group)
		&& post?.status === PostStatus.Published
		&& post?.isDeleted !== true
		&& post?.isEncrypted !== true
		&& hasActivityPubDateValue(post?.publishedAt)
		&& !!post?.localId;
}

export function assertActivityPubGroupFederatable(group: IGroup): void {
	if (!isActivityPubGroupFederatable(group)) {
		throw new Error('activitypub_group_not_federatable');
	}
}

export function assertActivityPubPostFederatable(group: IGroup, post: IPost): void {
	if (!isActivityPubPostFederatable(group, post)) {
		throw new Error('activitypub_post_not_federatable');
	}
}

function getPostContents(contentsByPostId: Map<number, IContentData[]> | undefined, post: IPost): IContentData[] {
	if (!post?.id || !contentsByPostId) {
		return [];
	}
	return contentsByPostId.get(post.id) || [];
}

function buildActivityPubImageLink(content: any) {
	if (!content?.url) {
		return null;
	}
	return {
		type: 'Image',
		mediaType: content.mimeType,
		url: content.url
	};
}

function buildActivityPubAttachments(contents: IContentData[]) {
	return contents
		.filter((content) => content?.url && content.type !== 'text')
		.map((content) => ({
			type: getActivityPubAttachmentType(content),
			mediaType: content.mimeType,
			url: content.url,
			name: content['name'] || content.storageId
		}));
}

function getActivityPubAttachmentType(content: IContentData): string {
	if (content.type === 'image') {
		return 'Image';
	}
	if (content.type === 'video') {
		return 'Video';
	}
	return 'Document';
}

function getActivityPubPostContent(contents: IContentData[]): string {
	const textContent = contents.find((content) => content?.type === 'text' && typeof content.text === 'string');
	if (!textContent) {
		return '';
	}
	if (textContent.mimeType === RICH_TEXT_MIME_TYPE) {
		return getActivityPubRichTextContent(textContent.text);
	}
	return escapeActivityPubHtml(textContent.text);
}

function getActivityPubRichTextContent(value: string): string {
	try {
		const document = JSON.parse(value);
		if (!isRichTextDocument(document)) {
			return escapeActivityPubHtml(value);
		}
		return richTextToSafeHtml(document);
	} catch {
		return escapeActivityPubHtml(value);
	}
}

function escapeActivityPubHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/\n/g, '<br>');
}

function toActivityPubDate(value): string {
	if (!value) {
		throw new Error('activitypub_post_published_at_required');
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error('activitypub_post_published_at_invalid');
	}
	return date.toISOString();
}

function hasActivityPubDateValue(value): boolean {
	if (!value) {
		return false;
	}
	const date = value instanceof Date ? value : new Date(value);
	return !Number.isNaN(date.getTime());
}
