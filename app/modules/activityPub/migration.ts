import {htmlToText, sanitizeAbsoluteHref, sanitizeHtml} from '../../htmlSafety.js';

export type ActivityPubMigrationImportKind = 'localPost' | 'remoteContext';
export type ActivityPubMigrationRelationType = 'post' | 'reply' | 'announce' | 'quote' | 'mention';
export type ActivityPubMigrationPlaceholderType = 'actor' | 'object';
export type ActivityPubMigrationOwnershipMethod = 'admin' | 'signedChallenge' | null;

export interface IActivityPubMigrationPreviewInput {
	actor: string;
	actorDocument?: any;
	items: any[];
	claimed?: boolean;
	ownershipVerified?: boolean;
	ownershipMethod?: ActivityPubMigrationOwnershipMethod;
}

export interface IActivityPubMigrationOwnershipReport {
	claimed: boolean;
	verified: boolean;
	method: ActivityPubMigrationOwnershipMethod;
	actor: string | null;
	reason: string | null;
}

export interface IActivityPubMigrationPreviewItem {
	activityId: string | null;
	activityType: string | null;
	objectId: string | null;
	objectType: string | null;
	actor: string | null;
	attributedTo: string | null;
	importKind: ActivityPubMigrationImportKind;
	relationTypes: ActivityPubMigrationRelationType[];
	isOwnAuthor: boolean;
	placeholderKeys: string[];
	preview: IActivityPubMigrationObjectPreview | null;
}

export interface IActivityPubMigrationRemotePlaceholder {
	key: string;
	protocol: 'activitypub';
	type: ActivityPubMigrationPlaceholderType;
	actorUrl?: string | null;
	objectId?: string | null;
	objectType?: string | null;
	relationTypes: ActivityPubMigrationRelationType[];
	sourceIdentity: IActivityPubMigrationSourceIdentity;
}

export interface IActivityPubMigrationSourceIdentity {
	protocol: 'activitypub';
	source?: 'activityPub';
	actorUrl?: string | null;
	objectId?: string | null;
	sourcePostId?: string | null;
}

export interface IActivityPubMigrationObjectPreview {
	name?: string;
	contentHtml?: string;
	contentText?: string;
	summaryHtml?: string;
	summaryText?: string;
	url?: string;
}

export interface IActivityPubMigrationPreview {
	actor: string;
	ownership: IActivityPubMigrationOwnershipReport;
	summary: {
		total: number;
		localPosts: number;
		remoteContextPosts: number;
		replies: number;
		announces: number;
		quotes: number;
		mentions: number;
		remoteActors: number;
		remoteObjects: number;
		remotePlaceholders: number;
	};
	list: IActivityPubMigrationPreviewItem[];
	remotePlaceholders: IActivityPubMigrationRemotePlaceholder[];
}

interface IActivityPubMigrationOwnerIdentity {
	actor: string;
	ids: string[];
}

interface IActivityPubMigrationNormalizedItem {
	activityId: string | null;
	activityType: string | null;
	activityActor: string | null;
	object: any;
	objectId: string | null;
	objectType: string | null;
	attributedTo: string | null;
	isAnnounce: boolean;
}

const maxActivityPubMigrationPreviewRawHtmlLength = 50000;
const maxActivityPubMigrationPreviewHtmlLength = 5000;
const maxActivityPubMigrationPreviewTextLength = 1000;
const maxActivityPubMigrationPreviewNameLength = 500;

export function createActivityPubMigrationPreview(input: IActivityPubMigrationPreviewInput): IActivityPubMigrationPreview {
	const actor = getRequiredActivityPubMigrationActor(input.actor);
	const owner = getActivityPubMigrationOwnerIdentity(actor, input.actorDocument);
	const items = getActivityPubMigrationItems(input.items);
	const placeholders = new Map<string, IActivityPubMigrationRemotePlaceholder>();
	const list = items.map(item => getActivityPubMigrationPreviewItem(item, owner, placeholders));
	const remotePlaceholders = Array.from(placeholders.values());
	return {
		actor,
		ownership: getActivityPubMigrationOwnershipReport(input, owner),
		summary: getActivityPubMigrationSummary(list, remotePlaceholders),
		list,
		remotePlaceholders
	};
}

function getActivityPubMigrationPreviewItem(
	item: any,
	owner: IActivityPubMigrationOwnerIdentity,
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>
): IActivityPubMigrationPreviewItem {
	const normalized = normalizeActivityPubMigrationItem(item);
	const relationTypes = getActivityPubMigrationRelationTypes(normalized);
	const isOwnAuthor = isActivityPubMigrationOwnActor(normalized.attributedTo || normalized.activityActor, owner);
	const importKind = getActivityPubMigrationImportKind(isOwnAuthor, relationTypes);
	const placeholderKeys: string[] = [];
	if (importKind === 'remoteContext') {
		appendActivityPubMigrationRemoteContextPlaceholders(placeholders, placeholderKeys, normalized, owner, relationTypes[0]);
	}
	appendActivityPubMigrationReplyPlaceholders(placeholders, placeholderKeys, normalized, owner);
	appendActivityPubMigrationQuotePlaceholders(placeholders, placeholderKeys, normalized, owner);
	appendActivityPubMigrationMentionPlaceholders(placeholders, placeholderKeys, normalized, owner);
	return {
		activityId: normalized.activityId,
		activityType: normalized.activityType,
		objectId: normalized.objectId,
		objectType: normalized.objectType,
		actor: normalized.activityActor,
		attributedTo: normalized.attributedTo,
		importKind,
		relationTypes,
		isOwnAuthor,
		placeholderKeys,
		preview: getActivityPubMigrationObjectPreview(normalized.object)
	};
}

function getActivityPubMigrationOwnershipReport(
	input: IActivityPubMigrationPreviewInput,
	owner: IActivityPubMigrationOwnerIdentity
): IActivityPubMigrationOwnershipReport {
	const claimed = Boolean(input.claimed);
	if (!claimed) {
		return {
			claimed,
			verified: false,
			method: null,
			actor: owner.actor,
			reason: 'activitypub_migration_not_claimed'
		};
	}
	if (input.ownershipVerified) {
		return {
			claimed,
			verified: true,
			method: input.ownershipMethod || 'admin',
			actor: owner.actor,
			reason: null
		};
	}
	return {
		claimed,
		verified: false,
		method: null,
		actor: owner.actor,
		reason: 'activitypub_migration_ownership_unverified'
	};
}

function getActivityPubMigrationSummary(
	list: IActivityPubMigrationPreviewItem[],
	remotePlaceholders: IActivityPubMigrationRemotePlaceholder[]
): IActivityPubMigrationPreview['summary'] {
	return {
		total: list.length,
		localPosts: list.filter(item => item.importKind === 'localPost').length,
		remoteContextPosts: list.filter(item => item.importKind === 'remoteContext').length,
		replies: list.filter(item => item.relationTypes.includes('reply')).length,
		announces: list.filter(item => item.relationTypes.includes('announce')).length,
		quotes: list.filter(item => item.relationTypes.includes('quote')).length,
		mentions: list.filter(item => item.relationTypes.includes('mention')).length,
		remoteActors: remotePlaceholders.filter(placeholder => placeholder.type === 'actor').length,
		remoteObjects: remotePlaceholders.filter(placeholder => placeholder.type === 'object').length,
		remotePlaceholders: remotePlaceholders.length
	};
}

function getActivityPubMigrationOwnerIdentity(actor: string, actorDocument: any): IActivityPubMigrationOwnerIdentity {
	return {
		actor,
		ids: getUniqueNormalizedActivityPubIds([
			actor,
			getOptionalString(actorDocument?.id),
			...getActivityPubMigrationStringArray(actorDocument?.url)
		])
	};
}

function getActivityPubMigrationItems(items: any[]): any[] {
	return Array.isArray(items) ? items.filter(Boolean) : [];
}

function normalizeActivityPubMigrationItem(item: any): IActivityPubMigrationNormalizedItem {
	const activityType = getOptionalString(item?.type);
	const isAnnounce = idsEqual(activityType, 'Announce');
	const rawObject = getActivityPubMigrationRawObject(item, activityType);
	const object = getActivityPubMigrationObject(rawObject);
	const objectId = getActivityPubMigrationObjectId(rawObject, object, item);
	return {
		activityId: getOptionalString(item?.id),
		activityType,
		activityActor: getFirstActivityPubMigrationString(item?.actor),
		object,
		objectId,
		objectType: getOptionalString(object?.type) || (objectId ? 'Object' : null),
		attributedTo: getFirstActivityPubMigrationString(object?.attributedTo || object?.actor),
		isAnnounce
	};
}

function getActivityPubMigrationRelationTypes(normalized: IActivityPubMigrationNormalizedItem): ActivityPubMigrationRelationType[] {
	const relationTypes: ActivityPubMigrationRelationType[] = [];
	if (normalized.isAnnounce) {
		relationTypes.push('announce');
	}
	if (getActivityPubMigrationReplyTarget(normalized.object)) {
		relationTypes.push('reply');
	}
	if (getActivityPubMigrationQuoteTarget(normalized.object)) {
		relationTypes.push('quote');
	}
	if (getActivityPubMigrationMentionActors(normalized.object).length) {
		relationTypes.push('mention');
	}
	if (relationTypes.length === 0) {
		relationTypes.push('post');
	}
	return relationTypes;
}

function getActivityPubMigrationImportKind(
	isOwnAuthor: boolean,
	relationTypes: ActivityPubMigrationRelationType[]
): ActivityPubMigrationImportKind {
	if (isOwnAuthor && !relationTypes.includes('announce')) {
		return 'localPost';
	}
	return 'remoteContext';
}

function appendActivityPubMigrationReplyPlaceholders(
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	normalized: IActivityPubMigrationNormalizedItem,
	owner: IActivityPubMigrationOwnerIdentity
): void {
	const replyTarget = getActivityPubMigrationReplyTarget(normalized.object);
	appendActivityPubMigrationTargetPlaceholder(placeholders, placeholderKeys, replyTarget, owner, 'reply');
}

function appendActivityPubMigrationRemoteContextPlaceholders(
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	normalized: IActivityPubMigrationNormalizedItem,
	owner: IActivityPubMigrationOwnerIdentity,
	relationType: ActivityPubMigrationRelationType
): void {
	if (!isActivityPubMigrationOwnObject(normalized.objectId, owner)) {
		appendActivityPubMigrationObjectPlaceholder(placeholders, placeholderKeys, normalized.objectId, normalized.objectType, relationType);
	}
	const actorUrl = normalized.attributedTo || normalized.activityActor;
	if (isActivityPubMigrationOwnActor(actorUrl, owner)) {
		return;
	}
	appendActivityPubMigrationActorPlaceholder(placeholders, placeholderKeys, actorUrl, relationType);
}

function appendActivityPubMigrationQuotePlaceholders(
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	normalized: IActivityPubMigrationNormalizedItem,
	owner: IActivityPubMigrationOwnerIdentity
): void {
	const quoteTarget = getActivityPubMigrationQuoteTarget(normalized.object);
	appendActivityPubMigrationTargetPlaceholder(placeholders, placeholderKeys, quoteTarget, owner, 'quote');
}

function appendActivityPubMigrationMentionPlaceholders(
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	normalized: IActivityPubMigrationNormalizedItem,
	owner: IActivityPubMigrationOwnerIdentity
): void {
	getActivityPubMigrationMentionActors(normalized.object).forEach((actorUrl) => {
		if (isActivityPubMigrationOwnActor(actorUrl, owner)) {
			return;
		}
		appendActivityPubMigrationActorPlaceholder(placeholders, placeholderKeys, actorUrl, 'mention');
	});
}

function appendActivityPubMigrationTargetPlaceholder(
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	target: any,
	owner: IActivityPubMigrationOwnerIdentity,
	relationType: ActivityPubMigrationRelationType
): void {
	const object = getActivityPubMigrationObject(target);
	const objectId = getActivityPubMigrationTargetId(target, object);
	const actorUrl = getFirstActivityPubMigrationString(object?.attributedTo || object?.actor);
	if (isActivityPubMigrationOwnObject(objectId, owner) || isActivityPubMigrationOwnActor(actorUrl, owner)) {
		return;
	}
	appendActivityPubMigrationObjectPlaceholder(placeholders, placeholderKeys, objectId, getOptionalString(object?.type), relationType);
	appendActivityPubMigrationActorPlaceholder(placeholders, placeholderKeys, actorUrl, relationType);
}

function appendActivityPubMigrationObjectPlaceholder(
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	objectId: string | null,
	objectType: string | null,
	relationType: ActivityPubMigrationRelationType
): void {
	if (!objectId) {
		return;
	}
	const key = `activitypub:object:${objectId}`;
	const existing = placeholders.get(key);
	if (existing) {
		appendActivityPubMigrationPlaceholderRelationType(existing, relationType);
		appendUniqueActivityPubMigrationPlaceholderKey(placeholderKeys, key);
		return;
	}
	const placeholder: IActivityPubMigrationRemotePlaceholder = {
		key,
		protocol: 'activitypub',
		type: 'object',
		objectId,
		objectType,
		relationTypes: [relationType],
		sourceIdentity: getActivityPubMigrationObjectSourceIdentity(objectId)
	};
	placeholders.set(key, placeholder);
	appendUniqueActivityPubMigrationPlaceholderKey(placeholderKeys, key);
}

function appendActivityPubMigrationActorPlaceholder(
	placeholders: Map<string, IActivityPubMigrationRemotePlaceholder>,
	placeholderKeys: string[],
	actorUrl: string | null,
	relationType: ActivityPubMigrationRelationType
): void {
	if (!actorUrl) {
		return;
	}
	const key = `activitypub:actor:${actorUrl}`;
	const existing = placeholders.get(key);
	if (existing) {
		appendActivityPubMigrationPlaceholderRelationType(existing, relationType);
		appendUniqueActivityPubMigrationPlaceholderKey(placeholderKeys, key);
		return;
	}
	const placeholder: IActivityPubMigrationRemotePlaceholder = {
		key,
		protocol: 'activitypub',
		type: 'actor',
		actorUrl,
		relationTypes: [relationType],
		sourceIdentity: getActivityPubMigrationActorSourceIdentity(actorUrl)
	};
	placeholders.set(key, placeholder);
	appendUniqueActivityPubMigrationPlaceholderKey(placeholderKeys, key);
}

function appendActivityPubMigrationPlaceholderRelationType(
	placeholder: IActivityPubMigrationRemotePlaceholder,
	relationType: ActivityPubMigrationRelationType
): void {
	if (placeholder.relationTypes.includes(relationType)) {
		return;
	}
	placeholder.relationTypes.push(relationType);
}

function appendUniqueActivityPubMigrationPlaceholderKey(placeholderKeys: string[], key: string): void {
	if (placeholderKeys.includes(key)) {
		return;
	}
	placeholderKeys.push(key);
}

function getActivityPubMigrationObjectSourceIdentity(objectId: string): IActivityPubMigrationSourceIdentity {
	return {
		protocol: 'activitypub',
		source: 'activityPub',
		objectId,
		sourcePostId: objectId
	};
}

function getActivityPubMigrationActorSourceIdentity(actorUrl: string): IActivityPubMigrationSourceIdentity {
	return {
		protocol: 'activitypub',
		actorUrl
	};
}

function getActivityPubMigrationObjectPreview(object: any): IActivityPubMigrationObjectPreview | null {
	if (!object || typeof object !== 'object') {
		return null;
	}
	const preview: IActivityPubMigrationObjectPreview = {};
	const name = getActivityPubMigrationTextField(object?.name, maxActivityPubMigrationPreviewNameLength);
	if (name) {
		preview.name = name;
	}
	const contentHtml = getActivityPubMigrationHtmlField(object?.content);
	if (contentHtml) {
		preview.contentHtml = contentHtml;
		preview.contentText = getActivityPubMigrationPreviewText(contentHtml);
	}
	const summaryHtml = getActivityPubMigrationHtmlField(object?.summary);
	if (summaryHtml) {
		preview.summaryHtml = summaryHtml;
		preview.summaryText = getActivityPubMigrationPreviewText(summaryHtml);
	}
	const url = getActivityPubMigrationSafeUrl(object);
	if (url) {
		preview.url = url;
	}
	if (!Object.keys(preview).length) {
		return null;
	}
	return preview;
}

function getActivityPubMigrationRawObject(item: any, activityType: string | null): any {
	if (idsEqual(activityType, 'Create') || idsEqual(activityType, 'Announce')) {
		return item?.object;
	}
	return item;
}

function getActivityPubMigrationObject(rawObject: any): any {
	if (rawObject && typeof rawObject === 'object') {
		return rawObject;
	}
	return {};
}

function getActivityPubMigrationObjectId(rawObject: any, object: any, item: any): string | null {
	return getOptionalString(rawObject)
		|| getOptionalString(object?.id)
		|| getOptionalString(item?.object)
		|| null;
}

function getActivityPubMigrationTargetId(target: any, object: any): string | null {
	return getOptionalString(target) || getOptionalString(object?.id);
}

function getActivityPubMigrationReplyTarget(object: any): any {
	return getFirstActivityPubMigrationValue(object?.inReplyTo);
}

function getActivityPubMigrationQuoteTarget(object: any): any {
	return getFirstActivityPubMigrationValue(
		object?.quoteUrl,
		object?.quoteUri,
		object?.quote,
		object?._misskey_quote
	);
}

function getActivityPubMigrationMentionActors(object: any): string[] {
	const tags = Array.isArray(object?.tag) ? object.tag : [];
	return getUniqueActivityPubStrings(tags
		.filter(tag => idsEqual(tag?.type, 'Mention'))
		.map(tag => getFirstActivityPubMigrationString(tag?.href, tag?.id)));
}

function getActivityPubMigrationSafeUrl(object: any): string {
	const values = getActivityPubMigrationStringArray(object?.url);
	for (const value of values) {
		const url = sanitizeAbsoluteHref(value);
		if (url) {
			return url;
		}
	}
	return '';
}

function getActivityPubMigrationHtmlField(value: any): string {
	const stringValue = getFirstActivityPubMigrationString(value);
	if (!stringValue) {
		return '';
	}
	const boundedHtml = truncateActivityPubMigrationPreview(stringValue, maxActivityPubMigrationPreviewRawHtmlLength);
	return truncateActivityPubMigrationPreview(sanitizeHtml(boundedHtml), maxActivityPubMigrationPreviewHtmlLength);
}

function getActivityPubMigrationTextField(value: any, maxLength: number): string {
	const stringValue = getFirstActivityPubMigrationString(value);
	if (!stringValue) {
		return '';
	}
	return truncateActivityPubMigrationPreview(htmlToText(stringValue), maxLength);
}

function getActivityPubMigrationPreviewText(html: string): string {
	return truncateActivityPubMigrationPreview(htmlToText(html), maxActivityPubMigrationPreviewTextLength);
}

function truncateActivityPubMigrationPreview(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}
	return value.slice(0, maxLength);
}

function isActivityPubMigrationOwnObject(objectId: string | null, owner: IActivityPubMigrationOwnerIdentity): boolean {
	if (!objectId) {
		return false;
	}
	return owner.ids.some(id => idsEqual(objectId, id) || objectIdStartsWithActor(objectId, id));
}

function isActivityPubMigrationOwnActor(actorUrl: string | null, owner: IActivityPubMigrationOwnerIdentity): boolean {
	if (!actorUrl) {
		return false;
	}
	return owner.ids.some(id => idsEqual(actorUrl, id));
}

function objectIdStartsWithActor(objectId: string, actorId: string): boolean {
	const normalizedObjectId = normalizeComparisonId(objectId);
	const normalizedActorId = normalizeComparisonId(actorId);
	if (!normalizedObjectId || !normalizedActorId) {
		return false;
	}
	return normalizedObjectId.startsWith(`${normalizedActorId}/`);
}

function getRequiredActivityPubMigrationActor(actor: string): string {
	const value = getOptionalString(actor);
	if (!value) {
		throw new Error('activitypub_migration_actor_required');
	}
	return value;
}

function getFirstActivityPubMigrationValue(...values: any[]): any {
	for (const value of values) {
		if (Array.isArray(value) && value.length) {
			return value[0];
		}
		if (value !== undefined && value !== null && value !== '') {
			return value;
		}
	}
	return null;
}

function getFirstActivityPubMigrationString(...values: any[]): string | null {
	for (const value of values) {
		const stringValue = getOptionalString(value);
		if (stringValue) {
			return stringValue;
		}
		if (Array.isArray(value)) {
			const arrayString = getFirstActivityPubMigrationString(...value);
			if (arrayString) {
				return arrayString;
			}
		}
		if (value && typeof value === 'object') {
			const objectString = getFirstActivityPubMigrationString(value.id, value.href, value.url);
			if (objectString) {
				return objectString;
			}
		}
	}
	return null;
}

function getActivityPubMigrationStringArray(value: any): string[] {
	if (Array.isArray(value)) {
		return getUniqueActivityPubStrings(value.map(item => getFirstActivityPubMigrationString(item)));
	}
	const stringValue = getOptionalString(value);
	return stringValue ? [stringValue] : [];
}

function getUniqueNormalizedActivityPubIds(values: Array<string | null | undefined>): string[] {
	return getUniqueActivityPubStrings(values.map(value => normalizeComparisonId(value)));
}

function getUniqueActivityPubStrings(values: Array<string | null | undefined>): string[] {
	return [...new Set(values.filter(Boolean) as string[])];
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
