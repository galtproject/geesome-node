import {ApiProblemError} from '../api/problem.js';

const reservedAliases = new Set(['account', 'api', 'archive', 'assets', 'auth', 'content', 'feed-index', 'ipfs', 'ipns', 'media', 'membership', 'page', 'post', 'posts', 'public', 'robots', 'sitemap', 'static', 'style']);

export function normalizeSubgroupAlias(value: unknown): string {
	if (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || reservedAliases.has(value)) {
		throw new ApiProblemError(400, 'subgroup_alias_invalid', 'Use a non-reserved lowercase route segment of 1–64 characters.');
	}
	return value;
}

export function normalizeSubgroupConfig(value: unknown = {}): {tabLabel?: string; order?: number} {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['tabLabel', 'order'].includes(key))) {
		throw new ApiProblemError(400, 'subgroup_config_invalid', 'Subgroup config accepts only tabLabel and order.');
	}
	const config: any = value;
	if (config.tabLabel !== undefined && (typeof config.tabLabel !== 'string' || !config.tabLabel.trim() || config.tabLabel.length > 80 || /[\x00-\x1f\x7f]/.test(config.tabLabel))) {
		throw new ApiProblemError(400, 'subgroup_config_invalid', 'Use a tab label of 1–80 characters.');
	}
	if (config.order !== undefined && (!Number.isSafeInteger(config.order) || config.order < 0 || config.order > 1000)) {
		throw new ApiProblemError(400, 'subgroup_config_invalid', 'Use a display order between 0 and 1000.');
	}
	return {...(config.tabLabel === undefined ? {} : {tabLabel: config.tabLabel.trim()}), ...(config.order === undefined ? {} : {order: config.order})};
}
