import {ApiProblemError} from '../api/problem.js';

export function normalizeContentPolicy(value) {
	if (value == null) {
		return null;
	}
	if (!['sfw', 'nsfw'].includes(value)) {
		throw new ApiProblemError(400, 'publication_content_policy_invalid', 'Choose sfw or nsfw');
	}
	return value;
}

export function assertContentPolicy(policy, network, target) {
	if (policy === 'sfw' && !(network === 'rule34xxx' ? target?.rating === 's' :
		['twitter', 'bluesky', 'discord', 'telegram'].includes(network) && target?.sensitive === false)) {
		throw new ApiProblemError(409, 'publication_content_policy_forbidden', 'SFW destinations require explicitly safe content');
	}
}

export function assertSingleEndpoint(policy, target) {
	if (policy && (Object.hasOwn(target, 'sfwChannelId') || Object.hasOwn(target, 'sfwChatId'))) {
		throw new ApiProblemError(400, 'publication_destination_single_endpoint_required', 'Use a separate destination for each channel');
	}
}
