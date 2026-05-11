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

function getSourceImportEventAction(previousPost, nextPost) {
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
	const nextPostData = getPlainPostData(nextPost);
	const previousPostData = getPlainPostData(previousPost);
	const sourceIdentity = getPostSourceIdentity(nextPostData);
	if (!sourceIdentity) {
		return null;
	}
	return {
		type: PostEventType.SourceImport,
		action: getSourceImportEventAction(previousPostData, nextPostData),
		userId,
		postId: nextPostData.id,
		groupId: sourceIdentity.groupId,
		source: sourceIdentity.source,
		sourceChannelId: sourceIdentity.sourceChannelId,
		sourcePostId: sourceIdentity.sourcePostId,
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

export function getPostEventState(post) {
	return getPlainPostData(post);
}
