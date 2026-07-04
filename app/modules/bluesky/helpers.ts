import {Buffer} from 'node:buffer';
import {
	RichTextDocument,
	RichTextInlineNode,
	RichTextMark,
	createRichTextDocument,
	richTextToPlainText
} from '../../richText.js';
import type {IRemoteContentModerationDecision} from '../remoteContentModeration/helpers.js';

export const blueskySocNet = 'bluesky';
export const blueskyPostSource = `socNetImport:${blueskySocNet}`;
export const defaultBlueskyOfficialHandle = 'bsky.app';
export const defaultBlueskyPublicApiOrigin = 'https://public.api.bsky.app';
export const defaultBlueskyAuthApiOrigin = 'https://bsky.social';
export const blueskyAuthorFeedFilters = new Set([
	'posts_with_replies',
	'posts_no_replies',
	'posts_with_media',
	'posts_and_author_threads'
]);

export type BlueskyFetch = (url: string, options?: any) => Promise<any>;

export interface IBlueskyAuthorFeedFetchOptions {
	actor: string;
	filter?: string;
	cursor?: string;
	limit?: number;
	origin?: string;
	timeoutMs?: number;
	fetch?: BlueskyFetch;
}

export interface IBlueskyPostRecordFetchOptions {
	uri: string;
	origin?: string;
	timeoutMs?: number;
	fetch?: BlueskyFetch;
}

export interface IBlueskySessionCreateOptions {
	identifier: string;
	password: string;
	origin?: string;
	timeoutMs?: number;
	fetch?: BlueskyFetch;
}

export interface IBlueskyActorProfileFetchOptions {
	actor: string;
	origin?: string;
	timeoutMs?: number;
	fetch?: BlueskyFetch;
	accessJwt?: string | null;
}

export interface IBlueskySession {
	did: string;
	handle: string | null;
	accessJwt: string;
	refreshJwt: string | null;
}

export interface IBlueskyActorProfile {
	did: string | null;
	handle: string | null;
	displayName: string | null;
	description: string | null;
	avatar: string | null;
}

export interface IBlueskyPostAtUriParts {
	repo: string;
	collection: string;
	rkey: string;
}

export interface IBlueskyPostRecordResult {
	exists: boolean;
	uri: string;
	cid: string | null;
	projection: IBlueskyPostProjection | null;
}

export interface IBlueskyPostSourceIdentity {
	source: string;
	sourceChannelId: string;
	sourcePostId: string;
}

export interface IBlueskyPostProjection {
	uri: string;
	cid?: string;
	author: IBlueskyAuthorProjection;
	sourceIdentity: IBlueskyPostSourceIdentity;
	createdAt: string | null;
	indexedAt: string | null;
	text: string;
	langs: string[];
	richText: RichTextDocument;
	reply: IBlueskyReplyProjection | null;
	embed: IBlueskyEmbedProjection;
	facetsCount: number;
	moderationDecision?: IRemoteContentModerationDecision;
}

export interface IBlueskyAuthorProjection {
	did: string | null;
	handle: string | null;
	displayName: string | null;
}

export interface IBlueskyReplyProjection {
	rootUri: string | null;
	parentUri: string | null;
}

export interface IBlueskyEmbedProjection {
	external: IBlueskyExternalEmbedProjection[];
	images: IBlueskyImageEmbedProjection[];
	unsupportedTypes: string[];
}

export interface IBlueskyExternalEmbedProjection {
	uri: string;
	title: string | null;
	description: string | null;
	thumbUrl: string | null;
}

export interface IBlueskyImageEmbedProjection {
	alt: string;
	thumbUrl: string | null;
	fullsizeUrl: string | null;
	mimeType: string | null;
	size: number | null;
	aspectRatio: {
		width: number;
		height: number;
	} | null;
}

export function buildBlueskyAuthorFeedUrl(options: IBlueskyAuthorFeedFetchOptions): string {
	const url = new URL('/xrpc/app.bsky.feed.getAuthorFeed', normalizeBlueskyApiOrigin(options.origin));
	url.searchParams.set('actor', normalizeBlueskyActor(options.actor));
	url.searchParams.set('limit', String(getBlueskyFeedLimit(options.limit)));
	const filter = normalizeBlueskyAuthorFeedFilter(options.filter);
	if (filter) {
		url.searchParams.set('filter', filter);
	}
	if (options.cursor) {
		url.searchParams.set('cursor', options.cursor);
	}
	return url.toString();
}

export function buildBlueskyPostRecordUrl(options: IBlueskyPostRecordFetchOptions): string {
	const parts = parseBlueskyPostAtUri(options.uri);
	if (!parts) {
		throw new Error('bluesky_post_uri_invalid');
	}
	const url = new URL('/xrpc/com.atproto.repo.getRecord', normalizeBlueskyApiOrigin(options.origin));
	url.searchParams.set('repo', parts.repo);
	url.searchParams.set('collection', parts.collection);
	url.searchParams.set('rkey', parts.rkey);
	return url.toString();
}

export function buildBlueskyCreateSessionUrl(options: {origin?: string} = {}): string {
	return new URL('/xrpc/com.atproto.server.createSession', normalizeBlueskyApiOrigin(options.origin, defaultBlueskyAuthApiOrigin)).toString();
}

export function buildBlueskyActorProfileUrl(options: IBlueskyActorProfileFetchOptions): string {
	const url = new URL('/xrpc/app.bsky.actor.getProfile', normalizeBlueskyApiOrigin(options.origin, defaultBlueskyAuthApiOrigin));
	url.searchParams.set('actor', normalizeBlueskyActor(options.actor));
	return url.toString();
}

export async function fetchBlueskyAuthorFeed(options: IBlueskyAuthorFeedFetchOptions): Promise<any> {
	const fetchImpl = options.fetch || fetch;
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), getBlueskyFetchTimeoutMs(options.timeoutMs));
	try {
		const response = await fetchImpl(buildBlueskyAuthorFeedUrl(options), {
			headers: {
				Accept: 'application/json'
			},
			signal: abortController.signal
		});
		if (!response.ok) {
			throw new Error(`bluesky_author_feed_fetch_failed:${response.status}`);
		}
		return await response.json();
	} finally {
		clearTimeout(timeout);
	}
}

export async function fetchBlueskyPostRecord(options: IBlueskyPostRecordFetchOptions): Promise<IBlueskyPostRecordResult> {
	const fetchImpl = options.fetch || fetch;
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), getBlueskyFetchTimeoutMs(options.timeoutMs));
	try {
		const response = await fetchImpl(buildBlueskyPostRecordUrl(options), {
			headers: {
				Accept: 'application/json'
			},
			signal: abortController.signal
		});
		if (!response.ok) {
			const errorPayload = await readBlueskyErrorPayload(response);
			if (isBlueskyRecordNotFoundResponse(response.status, errorPayload)) {
				return {
					exists: false,
					uri: options.uri,
					cid: null,
					projection: null
				};
			}
			throw new Error(`bluesky_post_record_fetch_failed:${response.status}`);
		}
		return projectBlueskyPostRecordResponse(await response.json(), options.uri);
	} finally {
		clearTimeout(timeout);
	}
}

export async function createBlueskySession(options: IBlueskySessionCreateOptions): Promise<IBlueskySession> {
	const fetchImpl = options.fetch || fetch;
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), getBlueskyFetchTimeoutMs(options.timeoutMs));
	try {
		const response = await fetchImpl(buildBlueskyCreateSessionUrl(options), {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				identifier: normalizeBlueskyActor(options.identifier),
				password: getRequiredBlueskyPassword(options.password)
			}),
			signal: abortController.signal
		});
		if (!response.ok) {
			throw new Error(`bluesky_session_create_failed:${response.status}`);
		}
		return getBlueskySessionResponse(await response.json());
	} finally {
		clearTimeout(timeout);
	}
}

export async function fetchBlueskyActorProfile(options: IBlueskyActorProfileFetchOptions): Promise<IBlueskyActorProfile> {
	const fetchImpl = options.fetch || fetch;
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), getBlueskyFetchTimeoutMs(options.timeoutMs));
	try {
		const headers: any = {
			Accept: 'application/json'
		};
		if (options.accessJwt) {
			headers.Authorization = `Bearer ${options.accessJwt}`;
		}
		const response = await fetchImpl(buildBlueskyActorProfileUrl(options), {
			headers,
			signal: abortController.signal
		});
		if (!response.ok) {
			throw new Error(`bluesky_actor_profile_fetch_failed:${response.status}`);
		}
		return getBlueskyActorProfileResponse(await response.json());
	} finally {
		clearTimeout(timeout);
	}
}

export function projectBlueskyAuthorFeed(feedResponse: any): IBlueskyPostProjection[] {
	return getArrayValues(feedResponse?.feed)
		.map(feedItem => projectBlueskyFeedItem(feedItem))
		.filter(Boolean) as IBlueskyPostProjection[];
}

export function parseBlueskyPostAtUri(uri: string): IBlueskyPostAtUriParts | null {
	const match = String(uri || '').match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
	if (!match) {
		return null;
	}
	if (match[2] !== 'app.bsky.feed.post') {
		return null;
	}
	return {
		repo: match[1],
		collection: match[2],
		rkey: match[3]
	};
}

export function projectBlueskyFeedItem(feedItem: any): IBlueskyPostProjection | null {
	const post = feedItem?.post;
	if (!isUsableBlueskyPostView(post)) {
		return null;
	}
	const record = post.record;
	const author = getBlueskyAuthorProjection(post.author);
	const sourceChannelId = getBlueskyPostSourceChannelId(post, author);
	return {
		uri: post.uri,
		cid: getOptionalString(post.cid) || undefined,
		author,
		sourceIdentity: {
			source: blueskyPostSource,
			sourceChannelId,
			sourcePostId: post.uri
		},
		createdAt: getOptionalString(record.createdAt),
		indexedAt: getOptionalString(post.indexedAt),
		text: getOptionalString(record.text) || '',
		langs: getBoundedStringList(record.langs, 10),
		richText: atProtoPostRecordToRichText(record, {
			source: {
				protocol: 'atproto',
				socNet: blueskySocNet,
				uri: post.uri,
				cid: getOptionalString(post.cid),
				author
			}
		}),
		reply: getBlueskyReplyProjection(record.reply),
		embed: getBlueskyEmbedProjection(record.embed, post.embed),
		facetsCount: getArrayValues(record.facets).length
	};
}

export function atProtoPostRecordToRichText(record: any, options: any = {}): RichTextDocument {
	const text = getOptionalString(record?.text) || '';
	if (!text) {
		return createRichTextDocument([], options);
	}
	return createRichTextDocument([{
		type: 'paragraph',
		children: atProtoTextToInlineNodes(text, record?.facets)
	}], {
		...options,
		lang: getBlueskyRecordLang(record)
	});
}

export function normalizeBlueskyActor(value: string): string {
	const actor = String(value || '').trim().replace(/^@/, '');
	if (!actor) {
		throw new Error('bluesky_actor_required');
	}
	return actor;
}

export function normalizeBlueskyAuthorFeedFilter(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const filter = String(value || '').trim();
	if (!filter) {
		return undefined;
	}
	if (!blueskyAuthorFeedFilters.has(filter)) {
		throw new Error('bluesky_author_feed_filter_invalid');
	}
	return filter;
}

export function getBlueskyProjectionPreview(projection: IBlueskyPostProjection) {
	return {
		uri: projection.uri,
		cid: projection.cid || null,
		author: projection.author,
		sourceIdentity: projection.sourceIdentity,
		createdAt: projection.createdAt,
		indexedAt: projection.indexedAt,
		text: richTextToPlainText(projection.richText),
		langs: projection.langs,
		facetsCount: projection.facetsCount,
		externalEmbeds: projection.embed.external.length,
		imageEmbeds: projection.embed.images.length,
		unsupportedEmbedTypes: projection.embed.unsupportedTypes,
		reply: projection.reply
	};
}

function atProtoTextToInlineNodes(text: string, facets: any): RichTextInlineNode[] {
	const ranges = getSupportedFacetRanges(text, facets);
	const nodes: RichTextInlineNode[] = [];
	let cursor = 0;
	ranges.forEach((range) => {
		if (range.start > cursor) {
			nodes.push({text: text.slice(cursor, range.start)});
		}
		const node: RichTextInlineNode = {text: text.slice(range.start, range.end)};
		if (range.marks.length > 0) {
			node.marks = range.marks;
		}
		nodes.push(node);
		cursor = range.end;
	});
	if (cursor < text.length) {
		nodes.push({text: text.slice(cursor)});
	}
	if (nodes.length === 0) {
		return [{text}];
	}
	return nodes;
}

function getSupportedFacetRanges(text: string, facets: any): {start: number; end: number; marks: RichTextMark[]}[] {
	const ranges: {start: number; end: number; marks: RichTextMark[]}[] = [];
	let lastEnd = 0;
	getArrayValues(facets)
		.map(facet => getSupportedFacetRange(text, facet))
		.filter(Boolean)
		.sort((left, right) => left!.start - right!.start || left!.end - right!.end)
		.forEach((range) => {
			if (!range) {
				return;
			}
			if (range.start < lastEnd) {
				return;
			}
			ranges.push(range);
			lastEnd = range.end;
		});
	return ranges;
}

function getSupportedFacetRange(text: string, facet: any): {start: number; end: number; marks: RichTextMark[]} | null {
	const index = facet?.index || {};
	const byteStart = getFiniteNumber(index.byteStart);
	const byteEnd = getFiniteNumber(index.byteEnd);
	if (byteStart === null || byteEnd === null || byteStart >= byteEnd) {
		return null;
	}
	const start = getStringIndexForUtf8ByteOffset(text, byteStart);
	const end = getStringIndexForUtf8ByteOffset(text, byteEnd);
	if (start === null || end === null || start >= end) {
		return null;
	}
	const marks = getArrayValues(facet.features)
		.map(feature => getRichTextMarkForAtProtoFacetFeature(feature))
		.filter(Boolean) as RichTextMark[];
	if (marks.length === 0) {
		return null;
	}
	return {start, end, marks};
}

function getRichTextMarkForAtProtoFacetFeature(feature: any): RichTextMark | null {
	if (feature?.$type === 'app.bsky.richtext.facet#link' && getOptionalString(feature.uri)) {
		return {
			type: 'link',
			href: feature.uri
		};
	}
	if (feature?.$type === 'app.bsky.richtext.facet#mention' && getOptionalString(feature.did)) {
		return {
			type: 'mention',
			id: feature.did,
			protocol: 'atproto'
		};
	}
	if (feature?.$type === 'app.bsky.richtext.facet#tag' && getOptionalString(feature.tag)) {
		return {
			type: 'hashtag',
			name: feature.tag,
			protocol: 'atproto'
		};
	}
	return null;
}

function getStringIndexForUtf8ByteOffset(text: string, byteOffset: number): number | null {
	if (byteOffset < 0) {
		return null;
	}
	let bytes = 0;
	for (let index = 0; index < text.length;) {
		if (bytes === byteOffset) {
			return index;
		}
		const codePoint = text.codePointAt(index);
		if (codePoint === undefined) {
			return null;
		}
		const character = String.fromCodePoint(codePoint);
		bytes += Buffer.byteLength(character, 'utf8');
		index += character.length;
		if (bytes > byteOffset) {
			return null;
		}
	}
	if (bytes === byteOffset) {
		return text.length;
	}
	return null;
}

function isUsableBlueskyPostView(post: any): boolean {
	if (!post || typeof post !== 'object') {
		return false;
	}
	if (!getOptionalString(post.uri)) {
		return false;
	}
	if (!post.record || typeof post.record !== 'object' || Array.isArray(post.record)) {
		return false;
	}
	if (post.record.$type && post.record.$type !== 'app.bsky.feed.post') {
		return false;
	}
	return typeof post.record.text === 'string';
}

function getBlueskyAuthorProjection(author: any): IBlueskyAuthorProjection {
	return {
		did: getOptionalString(author?.did),
		handle: getOptionalString(author?.handle),
		displayName: getOptionalString(author?.displayName)
	};
}

function getBlueskyPostSourceChannelId(post: any, author: IBlueskyAuthorProjection): string {
	if (author.did) {
		return author.did;
	}
	if (author.handle) {
		return author.handle;
	}
	return getRepoFromAtUri(post.uri) || normalizeBlueskyActor(post.uri);
}

function getRepoFromAtUri(uri: string): string | null {
	const match = String(uri || '').match(/^at:\/\/([^/]+)\//);
	if (!match) {
		return null;
	}
	return match[1] || null;
}

async function readBlueskyErrorPayload(response: any): Promise<any> {
	if (typeof response.json !== 'function') {
		return null;
	}
	try {
		return await response.json();
	} catch (_e) {
		return null;
	}
}

function isBlueskyRecordNotFoundResponse(status: number, errorPayload: any): boolean {
	if (status === 404 || status === 410) {
		return true;
	}
	const errorText = `${getOptionalString(errorPayload?.error) || ''} ${getOptionalString(errorPayload?.message) || ''}`.toLowerCase();
	if (!errorText) {
		return false;
	}
	return errorText.includes('recordnotfound') ||
		errorText.includes('record not found') ||
		errorText.includes('could not locate record');
}

function projectBlueskyPostRecordResponse(response: any, fallbackUri: string): IBlueskyPostRecordResult {
	const uri = getOptionalString(response?.uri) || fallbackUri;
	const parts = parseBlueskyPostAtUri(uri);
	const projection = projectBlueskyFeedItem({
		post: {
			uri,
			cid: getOptionalString(response?.cid),
			author: {
				did: parts?.repo || null
			},
			indexedAt: getOptionalString(response?.value?.createdAt),
			record: response?.value
		}
	});
	return {
		exists: true,
		uri,
		cid: getOptionalString(response?.cid),
		projection
	};
}

function getBlueskySessionResponse(response: any): IBlueskySession {
	const did = getOptionalString(response?.did);
	const accessJwt = getOptionalString(response?.accessJwt);
	if (!did || !accessJwt) {
		throw new Error('bluesky_session_response_invalid');
	}
	return {
		did,
		handle: getOptionalString(response?.handle),
		accessJwt,
		refreshJwt: getOptionalString(response?.refreshJwt)
	};
}

function getBlueskyActorProfileResponse(response: any): IBlueskyActorProfile {
	return {
		did: getOptionalString(response?.did),
		handle: getOptionalString(response?.handle),
		displayName: getOptionalString(response?.displayName),
		description: getOptionalString(response?.description),
		avatar: getOptionalString(response?.avatar)
	};
}

function getBlueskyReplyProjection(reply: any): IBlueskyReplyProjection | null {
	if (!reply || typeof reply !== 'object') {
		return null;
	}
	const rootUri = getOptionalString(reply.root?.uri);
	const parentUri = getOptionalString(reply.parent?.uri);
	if (!rootUri && !parentUri) {
		return null;
	}
	return {rootUri, parentUri};
}

function getBlueskyEmbedProjection(recordEmbed: any, viewEmbed: any): IBlueskyEmbedProjection {
	const projection: IBlueskyEmbedProjection = {
		external: [],
		images: [],
		unsupportedTypes: []
	};
	appendBlueskyEmbedProjection(projection, recordEmbed);
	appendBlueskyEmbedProjection(projection, viewEmbed);
	projection.unsupportedTypes = [...new Set(projection.unsupportedTypes)];
	return projection;
}

function appendBlueskyEmbedProjection(projection: IBlueskyEmbedProjection, embed: any): void {
	const embedType = getOptionalString(embed?.$type);
	if (!embedType) {
		return;
	}
	if (embedType === 'app.bsky.embed.external' || embedType === 'app.bsky.embed.external#view') {
		appendExternalEmbedProjection(projection, embed.external);
		return;
	}
	if (embedType === 'app.bsky.embed.images' || embedType === 'app.bsky.embed.images#view') {
		getArrayValues(embed.images).forEach(image => appendImageEmbedProjection(projection, image));
		return;
	}
	if (embedType === 'app.bsky.embed.recordWithMedia' || embedType === 'app.bsky.embed.recordWithMedia#view') {
		appendBlueskyEmbedProjection(projection, embed.media);
		return;
	}
	projection.unsupportedTypes.push(embedType);
}

function appendExternalEmbedProjection(projection: IBlueskyEmbedProjection, external: any): void {
	const uri = getOptionalString(external?.uri);
	if (!uri) {
		return;
	}
	if (projection.external.some(item => item.uri === uri)) {
		return;
	}
	projection.external.push({
		uri,
		title: getOptionalString(external.title),
		description: getOptionalString(external.description),
		thumbUrl: getOptionalString(external.thumb)
	});
}

function appendImageEmbedProjection(projection: IBlueskyEmbedProjection, image: any): void {
	const imageProjection = getImageEmbedProjection(image);
	if (!imageProjection) {
		return;
	}
	if (projection.images.some(item => item.fullsizeUrl === imageProjection.fullsizeUrl && item.thumbUrl === imageProjection.thumbUrl && item.alt === imageProjection.alt)) {
		return;
	}
	projection.images.push(imageProjection);
}

function getImageEmbedProjection(image: any): IBlueskyImageEmbedProjection | null {
	const thumbUrl = getOptionalString(image?.thumb);
	const fullsizeUrl = getOptionalString(image?.fullsize);
	const mimeType = getOptionalString(image?.image?.mimeType);
	const size = getFiniteNumber(image?.image?.size);
	if (!thumbUrl && !fullsizeUrl && !mimeType && size === null && !getOptionalString(image?.alt)) {
		return null;
	}
	return {
		alt: getOptionalString(image?.alt) || '',
		thumbUrl,
		fullsizeUrl,
		mimeType,
		size,
		aspectRatio: getAspectRatioProjection(image?.aspectRatio)
	};
}

function getAspectRatioProjection(aspectRatio: any): {width: number; height: number} | null {
	const width = getFiniteNumber(aspectRatio?.width);
	const height = getFiniteNumber(aspectRatio?.height);
	if (width === null || height === null || width <= 0 || height <= 0) {
		return null;
	}
	return {width, height};
}

function getBlueskyRecordLang(record: any): string | undefined {
	const langs = getBoundedStringList(record?.langs, 1);
	return langs[0];
}

function getBoundedStringList(value: any, limit: number): string[] {
	return getArrayValues(value)
		.map(item => getOptionalString(item))
		.filter(Boolean)
		.slice(0, limit) as string[];
}

function getBlueskyFeedLimit(value: number | undefined): number {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 10;
	}
	return Math.min(parsed, 100);
}

function getBlueskyFetchTimeoutMs(value: number | undefined): number {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 15000;
	}
	return parsed;
}

function normalizeBlueskyApiOrigin(value: string | undefined, fallback: string = defaultBlueskyPublicApiOrigin): string {
	const url = new URL(value || fallback);
	url.pathname = url.pathname.replace(/\/+$/, '');
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/+$/, '');
}

function getRequiredBlueskyPassword(value: string): string {
	const password = String(value || '').trim();
	if (!password) {
		throw new Error('bluesky_account_password_required');
	}
	return password;
}

function getFiniteNumber(value: any): number | null {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue)) {
		return null;
	}
	return numberValue;
}

function getOptionalString(value: any): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	if (!value) {
		return null;
	}
	return value;
}

function getArrayValues(value: any): any[] {
	if (Array.isArray(value)) {
		return value;
	}
	return [];
}
