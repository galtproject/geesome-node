/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {PostEventAction, PostEventType, PostStatus} from './interface.js';

function getPlainPostData(post) {
	if (!post) {
		return null;
	}
	if (typeof post.get === 'function') {
		return post.get({plain: true});
	}
	return post;
}

function getPostSourceIdentity(post) {
	const postData = getPlainPostData(post);
	if (!postData?.groupId || !postData.source || !postData.sourceChannelId || !postData.sourcePostId) {
		return null;
	}
	return {
		groupId: postData.groupId,
		source: postData.source,
		sourceChannelId: postData.sourceChannelId,
		sourcePostId: postData.sourcePostId
	};
}

function isDeletedPostState(post) {
	const postData = getPlainPostData(post);
	return postData?.isDeleted === true || postData?.status === PostStatus.Deleted;
}

function getPostEventAction(previousPost, nextPost) {
	if (!previousPost) {
		if (isDeletedPostState(nextPost)) {
			return PostEventAction.Deleted;
		}
		return PostEventAction.Created;
	}
	if (!isDeletedPostState(previousPost) && isDeletedPostState(nextPost)) {
		return PostEventAction.Deleted;
	}
	return PostEventAction.Updated;
}

function buildPostEvent(type: PostEventType, userId, previousPost, nextPost) {
	const nextPostData = getPlainPostData(nextPost);
	const previousPostData = getPlainPostData(previousPost);
	if (!nextPostData?.id || !nextPostData.groupId) {
		return null;
	}
	return {
		type,
		action: getPostEventAction(previousPostData, nextPostData),
		userId,
		postId: nextPostData.id,
		groupId: nextPostData.groupId,
		source: nextPostData.source || null,
		sourceChannelId: nextPostData.sourceChannelId || null,
		sourcePostId: nextPostData.sourcePostId || null,
		sourceDate: nextPostData.sourceDate,
		previousStatus: previousPostData?.status || null,
		nextStatus: nextPostData.status || null,
		previousIsDeleted: previousPostData ? previousPostData.isDeleted === true : null,
		nextIsDeleted: nextPostData.isDeleted === true,
		payloadJson: JSON.stringify({
			previous: pickPostEventPayload(previousPostData),
			next: pickPostEventPayload(nextPostData)
		})
	};
}

function pickPostEventPayload(postData) {
	if (!postData) {
		return null;
	}
	return {
		localId: postData.localId,
		replyToId: postData.replyToId,
		repostOfId: postData.repostOfId,
		size: postData.size,
		sourceDate: postData.sourceDate
	};
}

export function buildSourceImportPostEvent(userId, previousPost, nextPost) {
	const sourceIdentity = getPostSourceIdentity(nextPost);
	if (!sourceIdentity) {
		return null;
	}
	return buildPostEvent(PostEventType.SourceImport, userId, previousPost, nextPost);
}

export function buildPostLifecycleEvent(userId, previousPost, nextPost) {
	return buildPostEvent(PostEventType.PostLifecycle, userId, previousPost, nextPost);
}

export function getPostEventState(post) {
	return getPlainPostData(post);
}
