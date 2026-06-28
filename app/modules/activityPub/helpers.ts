import helpers from '../../helpers.js';
import type {
	IActivityPubConfig,
	IActivityPubGroupActorUrls,
	IActivityPubGroupInput,
	IActivityPubWebFingerResponse,
	IResolvedActivityPubConfig
} from './interface.js';

export const activityPubContext = 'https://www.w3.org/ns/activitystreams';
export const activityPubPublicCollection = 'https://www.w3.org/ns/activitystreams#Public';
export const activityPubContentType = 'application/activity+json; charset=utf-8';
export const activityPubWebFingerContentType = 'application/jrd+json; charset=utf-8';

export function resolveActivityPubConfig(config: IActivityPubConfig = {}): IResolvedActivityPubConfig {
	const parsedPublicUrl = parseActivityPubPublicUrl(config.publicUrl);

	return {
		enabled: isActivityPubEnabled(config),
		publicUrl: getActivityPubPublicUrl(parsedPublicUrl),
		domain: getActivityPubDomain(config.domain, parsedPublicUrl)
	};
}

export function getActivityPubGroupPreferredUsername(group: IActivityPubGroupInput): string {
	const name = typeof group === 'string' ? group : group?.name;
	const preferredUsername = String(name || '').trim();
	if (!preferredUsername) {
		throw new Error('activitypub_group_name_required');
	}
	if (!helpers.validateUsername(preferredUsername)) {
		throw new Error('activitypub_group_name_invalid');
	}
	return preferredUsername;
}

export function getActivityPubGroupActorUrls(config: IActivityPubConfig, group: IActivityPubGroupInput): IActivityPubGroupActorUrls {
	const resolvedConfig = resolveActivityPubConfig(config);
	const actorUrl = `${resolvedConfig.publicUrl}/ap/groups/${encodeActivityPubPathSegment(getActivityPubGroupPreferredUsername(group))}`;

	return {
		actorUrl,
		inboxUrl: `${actorUrl}/inbox`,
		outboxUrl: `${actorUrl}/outbox`,
		followersUrl: `${actorUrl}/followers`,
		followingUrl: `${actorUrl}/following`,
		sharedInboxUrl: getActivityPubSharedInboxUrl(resolvedConfig)
	};
}

export function getActivityPubGroupPostObjectUrl(config: IActivityPubConfig, group: IActivityPubGroupInput, localId: number | string): string {
	const resolvedConfig = resolveActivityPubConfig(config);
	const postLocalId = normalizeActivityPubPostLocalId(localId);
	const preferredUsername = getActivityPubGroupPreferredUsername(group);

	return `${resolvedConfig.publicUrl}/ap/groups/${encodeActivityPubPathSegment(preferredUsername)}/posts/${postLocalId}`;
}

export function getActivityPubWebFingerResource(config: IActivityPubConfig, group: IActivityPubGroupInput): string {
	const resolvedConfig = resolveActivityPubConfig(config);
	return `acct:${getActivityPubGroupPreferredUsername(group)}@${resolvedConfig.domain}`;
}

export function getActivityPubWebFingerUrl(config: IActivityPubConfig, group: IActivityPubGroupInput): string {
	const resolvedConfig = resolveActivityPubConfig(config);
	const resource = getActivityPubWebFingerResource(resolvedConfig, group);

	return `${resolvedConfig.publicUrl}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;
}

export function buildActivityPubGroupWebFingerResponse(config: IActivityPubConfig, group: IActivityPubGroupInput): IActivityPubWebFingerResponse {
	const urls = getActivityPubGroupActorUrls(config, group);
	const subject = getActivityPubWebFingerResource(config, group);

	return {
		subject,
		aliases: [urls.actorUrl],
		links: [
			{
				rel: 'self',
				type: 'application/activity+json',
				href: urls.actorUrl
			}
		]
	};
}

export function isActivityPubEnabled(config: IActivityPubConfig): boolean {
	return config.enabled === true || config.enabled === '1' || config.enabled === 'true';
}

function parseActivityPubPublicUrl(publicUrl) {
	const rawPublicUrl = String(publicUrl || '').trim();
	if (!rawPublicUrl) {
		throw new Error('activitypub_public_url_required');
	}
	try {
		const parsedUrl = new URL(rawPublicUrl);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			throw new Error('activitypub_public_url_protocol_invalid');
		}
		parsedUrl.search = '';
		parsedUrl.hash = '';
		return parsedUrl;
	} catch (e) {
		if (e?.message === 'activitypub_public_url_protocol_invalid') {
			throw e;
		}
		throw new Error('activitypub_public_url_invalid');
	}
}

function getActivityPubPublicUrl(parsedPublicUrl: URL): string {
	const normalizedPath = parsedPublicUrl.pathname === '/'
		? ''
		: parsedPublicUrl.pathname.replace(/\/+$/, '');
	return `${parsedPublicUrl.origin}${normalizedPath}`;
}

function getActivityPubDomain(configDomain, parsedPublicUrl: URL): string {
	const domain = String(configDomain || '').trim();
	if (!domain) {
		return parsedPublicUrl.host.toLowerCase();
	}
	if (domain.includes('://')) {
		return new URL(domain).host.toLowerCase();
	}
	return domain.replace(/^@/, '').replace(/\/+$/, '').toLowerCase();
}

function getActivityPubSharedInboxUrl(config: IResolvedActivityPubConfig): string {
	return `${config.publicUrl}/ap/shared-inbox`;
}

export function normalizeActivityPubPostLocalId(localId: number | string): string {
	const postLocalId = Number(localId);
	if (!Number.isInteger(postLocalId) || postLocalId <= 0) {
		throw new Error('activitypub_post_local_id_invalid');
	}
	return String(postLocalId);
}

function encodeActivityPubPathSegment(value: string): string {
	return encodeURIComponent(value);
}
