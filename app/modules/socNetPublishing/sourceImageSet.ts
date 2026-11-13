import {ApiProblemError} from '../api/problem.js';
import {readMembershipPostMetadata} from '../staticSiteGenerator/membershipPostMetadata.js';

export function normalizeSourceImageSet(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 ||
		Object.keys(value).some(key => !['groupId', 'postId'].includes(key)) ||
		![value.groupId, value.postId].every(id => Number.isSafeInteger(id) && id > 0)) {
		throw new ApiProblemError(400, 'publication_image_set_invalid', 'Select a valid source image set.');
	}
	return {groupId: value.groupId, postId: value.postId};
}

export async function validateSourceImageSet(app, userId, value) {
	const reference = normalizeSourceImageSet(value);
	const post = await app.ms.group.getPost(userId, reference.postId);
	const group = post?.group;
	const metadata = readMembershipPostMetadata(post || {});
	if (!post || Number(post.id) !== reference.postId || Number(post.groupId) !== reference.groupId || Number(post.userId) !== Number(userId) ||
		post.status !== 'published' || post.isDeleted || post.isEncrypted || post.isRemote ||
		!group || Number(group.id) !== reference.groupId || Number(group.creatorId) !== Number(userId) ||
		group.isPublic !== false || group.isEncrypted || group.isDeleted || group.isRemote || !metadata || metadata.hidden) {
		throw new ApiProblemError(403, 'publication_image_set_forbidden', 'The source image set is unavailable.');
	}
	return reference;
}
