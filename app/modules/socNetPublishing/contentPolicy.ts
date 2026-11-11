import {ApiProblemError} from '../api/problem.js';

export function normalizeContentPolicy(value) {
	if (!['sfw', 'nsfw'].includes(value)) {
		throw new ApiProblemError(400, 'publication_content_policy_invalid', 'contentPolicy must be sfw or nsfw');
	}
	return value;
}

export function normalizeContentType(value) {
	if (!['sfw', 'nsfw'].includes(value)) {
		throw new ApiProblemError(400, 'publication_content_type_invalid', 'contentType must be sfw or nsfw');
	}
	return value;
}

export function isContentTypeAllowed(contentType, contentPolicy) {
	return ['sfw', 'nsfw'].includes(contentType) && ['sfw', 'nsfw'].includes(contentPolicy) && !(contentType === 'nsfw' && contentPolicy === 'sfw');
}

export function assertContentPolicy(contentType, contentPolicy) {
	normalizeContentType(contentType);
	normalizeContentType(contentPolicy);
	if (!isContentTypeAllowed(contentType, contentPolicy)) {
		throw new ApiProblemError(409, 'publication_content_policy_forbidden', 'NSFW content cannot be published to an SFW destination');
	}
}
