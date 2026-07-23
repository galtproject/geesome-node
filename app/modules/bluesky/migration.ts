import {
	IBlueskyAuthorProjection,
	IBlueskyPostProjection,
	IBlueskyRecordProjection,
	blueskyPostSource,
	getBlueskyProjectionPreview,
	normalizeBlueskyActor,
	parseBlueskyPostAtUri
} from './helpers.js';

export type BlueskyMigrationImportKind = 'localPost' | 'remoteContext';
export type BlueskyMigrationRelationType = 'post' | 'reply' | 'repost' | 'quote';
export type BlueskyMigrationPlaceholderType = 'actor' | 'post';
export type BlueskyMigrationOwnershipMethod = 'did' | 'handle' | null;

export interface IBlueskyMigrationPreviewInput {
	actor: string;
	projections: IBlueskyPostProjection[];
	claimed?: boolean;
	accountDid?: string | null;
	accountHandle?: string | null;
}

export interface IBlueskyMigrationOwnershipReport {
	claimed: boolean;
	verified: boolean;
	method: BlueskyMigrationOwnershipMethod;
	did: string | null;
	handle: string | null;
	reason: string | null;
}

export interface IBlueskyMigrationPreviewItem {
	uri: string;
	cid: string | null;
	importKind: BlueskyMigrationImportKind;
	relationTypes: BlueskyMigrationRelationType[];
	isOwnAuthor: boolean;
	placeholderKeys: string[];
	preview: any;
}

export interface IBlueskyMigrationRemotePlaceholder {
	key: string;
	protocol: 'atproto';
	type: BlueskyMigrationPlaceholderType;
	did?: string | null;
	handle?: string | null;
	uri?: string | null;
	cid?: string | null;
	relationTypes: BlueskyMigrationRelationType[];
	sourceIdentity: IBlueskyMigrationSourceIdentity;
}

export interface IBlueskyMigrationSourceIdentity {
	protocol: 'atproto';
	source: string;
	sourceChannelId?: string | null;
	sourcePostId?: string | null;
	did?: string | null;
	handle?: string | null;
	uri?: string | null;
	cid?: string | null;
}

export interface IBlueskyMigrationPreview {
	actor: string;
	ownership: IBlueskyMigrationOwnershipReport;
	summary: {
		total: number;
		localPosts: number;
		remoteContextPosts: number;
		replies: number;
		reposts: number;
		quotes: number;
		remoteActors: number;
		remotePlaceholders: number;
	};
	list: IBlueskyMigrationPreviewItem[];
	remotePlaceholders: IBlueskyMigrationRemotePlaceholder[];
}

interface IBlueskyMigrationOwnerIdentity {
	actor: string;
	ids: string[];
	did: string | null;
	handle: string | null;
	projectedAuthor: IBlueskyAuthorProjection | null;
}

export function createBlueskyMigrationPreview(input: IBlueskyMigrationPreviewInput): IBlueskyMigrationPreview {
	const actor = normalizeBlueskyActor(input.actor);
	const projections = getBlueskyMigrationProjections(input.projections);
	const owner = getBlueskyMigrationOwnerIdentity(actor, input, projections);
	const placeholders = new Map<string, IBlueskyMigrationRemotePlaceholder>();
	const list = projections.map(projection => getBlueskyMigrationPreviewItem(projection, owner, placeholders));
	const remotePlaceholders = Array.from(placeholders.values());
	return {
		actor,
		ownership: getBlueskyMigrationOwnershipReport(input, owner),
		summary: {
			total: list.length,
			localPosts: list.filter(item => item.importKind === 'localPost').length,
			remoteContextPosts: list.filter(item => item.importKind === 'remoteContext').length,
			replies: list.filter(item => item.relationTypes.includes('reply')).length,
			reposts: list.filter(item => item.relationTypes.includes('repost')).length,
			quotes: list.filter(item => item.relationTypes.includes('quote')).length,
			remoteActors: remotePlaceholders.filter(placeholder => placeholder.type === 'actor').length,
			remotePlaceholders: remotePlaceholders.length
		},
		list,
		remotePlaceholders
	};
}

function getBlueskyMigrationPreviewItem(
	projection: IBlueskyPostProjection,
	owner: IBlueskyMigrationOwnerIdentity,
	placeholders: Map<string, IBlueskyMigrationRemotePlaceholder>
): IBlueskyMigrationPreviewItem {
	const relationTypes = getBlueskyMigrationRelationTypes(projection);
	const isOwnAuthor = isBlueskyMigrationOwnAuthor(projection.author, owner);
	const importKind = isOwnAuthor && !relationTypes.includes('repost') ? 'localPost' : 'remoteContext';
	const placeholderKeys: string[] = [];
	if (importKind === 'remoteContext') {
		appendBlueskyMigrationPostPlaceholder(placeholders, placeholderKeys, projection.uri, projection.cid || null, projection.author, relationTypes[0]);
		appendBlueskyMigrationActorPlaceholder(placeholders, placeholderKeys, projection.author, relationTypes[0]);
	}
	appendBlueskyMigrationReplyPlaceholders(placeholders, placeholderKeys, projection, owner);
	appendBlueskyMigrationQuotePlaceholders(placeholders, placeholderKeys, projection.quote, owner);
	return {
		uri: projection.uri,
		cid: projection.cid || null,
		importKind,
		relationTypes,
		isOwnAuthor,
		placeholderKeys,
		preview: getBlueskyProjectionPreview(projection)
	};
}

function getBlueskyMigrationOwnershipReport(
	input: IBlueskyMigrationPreviewInput,
	owner: IBlueskyMigrationOwnerIdentity
): IBlueskyMigrationOwnershipReport {
	const claimed = Boolean(input.claimed);
	if (!claimed) {
		return {
			claimed,
			verified: false,
			method: null,
			did: owner.did,
			handle: owner.handle,
			reason: 'bluesky_migration_not_claimed'
		};
	}
	if (owner.did && idsEqual(input.accountDid, owner.did)) {
		return {
			claimed,
			verified: true,
			method: 'did',
			did: owner.did,
			handle: owner.handle,
			reason: null
		};
	}
	if (owner.handle && idsEqual(input.accountHandle, owner.handle)) {
		return {
			claimed,
			verified: true,
			method: 'handle',
			did: owner.did,
			handle: owner.handle,
			reason: null
		};
	}
	return {
		claimed,
		verified: false,
		method: null,
		did: owner.did,
		handle: owner.handle,
		reason: 'bluesky_migration_account_mismatch'
	};
}

function getBlueskyMigrationOwnerIdentity(
	actor: string,
	input: IBlueskyMigrationPreviewInput,
	projections: IBlueskyPostProjection[]
): IBlueskyMigrationOwnerIdentity {
	const projectedAuthor = getBlueskyMigrationProjectedAuthor(actor, projections);
	const did = getFirstString(projectedAuthor?.did, isDid(actor) ? actor : null, idsEqual(input.accountDid, actor) ? input.accountDid : null);
	const handle = getFirstString(projectedAuthor?.handle, isDid(actor) ? null : actor, idsEqual(input.accountHandle, actor) ? input.accountHandle : null);
	return {
		actor,
		ids: getUniqueNormalizedIds([actor, did, handle, projectedAuthor?.did, projectedAuthor?.handle]),
		did,
		handle,
		projectedAuthor
	};
}

function getBlueskyMigrationProjectedAuthor(actor: string, projections: IBlueskyPostProjection[]): IBlueskyAuthorProjection | null {
	return projections.find((projection) => {
		if (idsEqual(projection.sourceIdentity?.sourceChannelId, actor)) {
			return true;
		}
		return idsEqual(projection.author?.did, actor) || idsEqual(projection.author?.handle, actor);
	})?.author || null;
}

function getBlueskyMigrationRelationTypes(projection: IBlueskyPostProjection): BlueskyMigrationRelationType[] {
	const relationTypes: BlueskyMigrationRelationType[] = [];
	if (projection.repost) {
		relationTypes.push('repost');
	}
	if (projection.reply) {
		relationTypes.push('reply');
	}
	if (projection.quote) {
		relationTypes.push('quote');
	}
	if (relationTypes.length === 0) {
		relationTypes.push('post');
	}
	return relationTypes;
}

function appendBlueskyMigrationReplyPlaceholders(
	placeholders: Map<string, IBlueskyMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	projection: IBlueskyPostProjection,
	owner: IBlueskyMigrationOwnerIdentity
): void {
	const reply = projection.reply;
	if (!reply) {
		return;
	}
	appendBlueskyMigrationRemotePostUri(placeholders, placeholderKeys, reply.rootUri, owner, 'reply');
	appendBlueskyMigrationRemotePostUri(placeholders, placeholderKeys, reply.parentUri, owner, 'reply');
}

function appendBlueskyMigrationQuotePlaceholders(
	placeholders: Map<string, IBlueskyMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	quote: IBlueskyRecordProjection | null,
	owner: IBlueskyMigrationOwnerIdentity
): void {
	if (!quote) {
		return;
	}
	const postAuthor = quote.author || getBlueskyAuthorFromAtUri(quote.uri);
	if (postAuthor && isBlueskyMigrationOwnAuthor(postAuthor, owner)) {
		return;
	}
	appendBlueskyMigrationPostPlaceholder(placeholders, placeholderKeys, quote.uri, quote.cid, postAuthor, 'quote');
	if (postAuthor) {
		appendBlueskyMigrationActorPlaceholder(placeholders, placeholderKeys, postAuthor, 'quote');
	}
}

function appendBlueskyMigrationRemotePostUri(
	placeholders: Map<string, IBlueskyMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	uri: string | null,
	owner: IBlueskyMigrationOwnerIdentity,
	relationType: BlueskyMigrationRelationType
): void {
	if (!uri) {
		return;
	}
	const author = getBlueskyAuthorFromAtUri(uri);
	if (author && isBlueskyMigrationOwnAuthor(author, owner)) {
		return;
	}
	appendBlueskyMigrationPostPlaceholder(placeholders, placeholderKeys, uri, null, author, relationType);
	if (author) {
		appendBlueskyMigrationActorPlaceholder(placeholders, placeholderKeys, author, relationType);
	}
}

function appendBlueskyMigrationPostPlaceholder(
	placeholders: Map<string, IBlueskyMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	uri: string,
	cid: string | null,
	author: IBlueskyAuthorProjection | null,
	relationType: BlueskyMigrationRelationType
): void {
	const key = `atproto:post:${uri}`;
	const existing = placeholders.get(key);
	if (existing) {
		mergeBlueskyMigrationPostPlaceholderIdentity(existing, uri, cid, author);
		appendPlaceholderRelationType(existing, relationType);
		appendUniquePlaceholderKey(placeholderKeys, key);
		return;
	}
	const placeholder: IBlueskyMigrationRemotePlaceholder = {
		key,
		protocol: 'atproto',
		type: 'post',
		uri,
		cid: cid || null,
		did: author?.did || getRepoFromBlueskyAtUri(uri),
		handle: author?.handle || null,
		relationTypes: [relationType],
		sourceIdentity: getBlueskyMigrationPostSourceIdentity(uri, cid, author)
	};
	placeholders.set(key, placeholder);
	appendUniquePlaceholderKey(placeholderKeys, key);
}

function appendBlueskyMigrationActorPlaceholder(
	placeholders: Map<string, IBlueskyMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	author: IBlueskyAuthorProjection,
	relationType: BlueskyMigrationRelationType
): void {
	const keyValue = author.did || author.handle;
	if (!keyValue) {
		return;
	}
	const key = `atproto:actor:${keyValue}`;
	const existing = placeholders.get(key);
	if (existing) {
		mergeBlueskyMigrationActorPlaceholderIdentity(existing, author);
		appendPlaceholderRelationType(existing, relationType);
		appendUniquePlaceholderKey(placeholderKeys, key);
		return;
	}
	const placeholder: IBlueskyMigrationRemotePlaceholder = {
		key,
		protocol: 'atproto',
		type: 'actor',
		did: author.did || null,
		handle: author.handle || null,
		relationTypes: [relationType],
		sourceIdentity: getBlueskyMigrationActorSourceIdentity(author)
	};
	placeholders.set(key, placeholder);
	appendUniquePlaceholderKey(placeholderKeys, key);
}

function appendPlaceholderRelationType(
	placeholder: IBlueskyMigrationRemotePlaceholder,
	relationType: BlueskyMigrationRelationType
): void {
	if (placeholder.relationTypes.includes(relationType)) {
		return;
	}
	placeholder.relationTypes.push(relationType);
}

function appendUniquePlaceholderKey(placeholderKeys: string[], key: string): void {
	if (placeholderKeys.includes(key)) {
		return;
	}
	placeholderKeys.push(key);
}

function mergeBlueskyMigrationPostPlaceholderIdentity(
	placeholder: IBlueskyMigrationRemotePlaceholder,
	uri: string,
	cid: string | null,
	author: IBlueskyAuthorProjection | null
): void {
	const sourceIdentity = getBlueskyMigrationPostSourceIdentity(uri, cid, author);
	if (!placeholder.cid && sourceIdentity.cid) {
		placeholder.cid = sourceIdentity.cid;
	}
	mergeBlueskyMigrationPlaceholderIdentity(placeholder, sourceIdentity);
}

function mergeBlueskyMigrationActorPlaceholderIdentity(
	placeholder: IBlueskyMigrationRemotePlaceholder,
	author: IBlueskyAuthorProjection
): void {
	mergeBlueskyMigrationPlaceholderIdentity(placeholder, getBlueskyMigrationActorSourceIdentity(author));
}

function mergeBlueskyMigrationPlaceholderIdentity(
	placeholder: IBlueskyMigrationRemotePlaceholder,
	sourceIdentity: IBlueskyMigrationSourceIdentity
): void {
	if (!placeholder.did && sourceIdentity.did) {
		placeholder.did = sourceIdentity.did;
	}
	if (!placeholder.handle && sourceIdentity.handle) {
		placeholder.handle = sourceIdentity.handle;
	}
	placeholder.sourceIdentity = {
		...placeholder.sourceIdentity,
		...getDefinedBlueskyMigrationSourceIdentityFields(sourceIdentity)
	};
}

function getDefinedBlueskyMigrationSourceIdentityFields(sourceIdentity: IBlueskyMigrationSourceIdentity): IBlueskyMigrationSourceIdentity {
	return Object.fromEntries(Object.entries(sourceIdentity).filter(([, value]) => value !== undefined && value !== null)) as IBlueskyMigrationSourceIdentity;
}

function getBlueskyMigrationPostSourceIdentity(
	uri: string,
	cid: string | null,
	author: IBlueskyAuthorProjection | null
): IBlueskyMigrationSourceIdentity {
	const did = author?.did || getRepoFromBlueskyAtUri(uri);
	const handle = author?.handle || null;
	return {
		protocol: 'atproto',
		source: blueskyPostSource,
		sourceChannelId: did || handle,
		sourcePostId: uri,
		did,
		handle,
		uri,
		cid: cid || null
	};
}

function getBlueskyMigrationActorSourceIdentity(author: IBlueskyAuthorProjection): IBlueskyMigrationSourceIdentity {
	return {
		protocol: 'atproto',
		source: blueskyPostSource,
		sourceChannelId: author.did || author.handle,
		did: author.did || null,
		handle: author.handle || null
	};
}

function isBlueskyMigrationOwnAuthor(author: IBlueskyAuthorProjection, owner: IBlueskyMigrationOwnerIdentity): boolean {
	return owner.ids.some((id) => {
		return idsEqual(author?.did, id) || idsEqual(author?.handle, id);
	});
}

function getBlueskyAuthorFromAtUri(uri: string): IBlueskyAuthorProjection | null {
	const did = getRepoFromBlueskyAtUri(uri);
	if (!did) {
		return null;
	}
	return {
		did,
		handle: null,
		displayName: null
	};
}

function getRepoFromBlueskyAtUri(uri: string): string | null {
	const parts = parseBlueskyPostAtUri(uri);
	if (!parts) {
		return null;
	}
	return parts.repo;
}

function getBlueskyMigrationProjections(projections: IBlueskyPostProjection[]): IBlueskyPostProjection[] {
	return Array.isArray(projections) ? projections.filter(Boolean) : [];
}

function getUniqueNormalizedIds(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.map(value => normalizeComparisonId(value)).filter(Boolean) as string[])];
}

function getFirstString(...values: Array<string | null | undefined>): string | null {
	for (const value of values) {
		const stringValue = getOptionalString(value);
		if (stringValue) {
			return stringValue;
		}
	}
	return null;
}

function idsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
	const normalizedLeft = normalizeComparisonId(left);
	const normalizedRight = normalizeComparisonId(right);
	if (!normalizedLeft || !normalizedRight) {
		return false;
	}
	return normalizedLeft === normalizedRight;
}

function normalizeComparisonId(value: string | null | undefined): string | null {
	const stringValue = getOptionalString(value);
	return stringValue ? stringValue.toLowerCase() : null;
}

function getOptionalString(value: any): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed || null;
}

function isDid(value: string): boolean {
	return value.startsWith('did:');
}
