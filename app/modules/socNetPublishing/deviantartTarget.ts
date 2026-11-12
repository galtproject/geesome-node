import {ApiProblemError} from '../api/problem.js';

export function normalizeDeviantArtTarget(target: any) {
	if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key => !['title', 'tags', 'isAiGenerated', 'noAi'].includes(key)) ||
		typeof target.title !== 'string' || !target.title.trim() || [...target.title].length > 50 || /[\u0000-\u001f\u007f]/.test(target.title) ||
		typeof target.isAiGenerated !== 'boolean' || target.noAi !== undefined && typeof target.noAi !== 'boolean' ||
		target.tags !== undefined && (!Array.isArray(target.tags) || target.tags.length > 30 || target.tags.some(tag => typeof tag !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(tag)) || new Set(target.tags).size !== target.tags.length)) {
		throw Object.assign(new ApiProblemError(400, 'local_publication_target_invalid', 'DeviantArt requires a title, explicit isAiGenerated flag, and valid optional tags/noAi.'), {ambiguous: false});
	}
	return {title: target.title.trim(), tags: target.tags || [], isAiGenerated: target.isAiGenerated, noAi: target.noAi ?? true};
}
