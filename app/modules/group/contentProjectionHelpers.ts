import type {IContent, IContentDataProjectionOptions} from '../database/interface.js';
import type {RichTextDocument} from '../../richText.js';
import {
	RICH_TEXT_MIME_TYPE,
	contentTextToRichText,
	richTextToPlainText
} from '../../richText.js';

type ContentTextStorage = {
	getFileDataText(storageId: string): Promise<string>;
};

const defaultBodyTextCacheMaxEntries = 500;

function touchBodyTextCache(cache: Map<string, string>, storageId: string, text: string): void {
	cache.delete(storageId);
	cache.set(storageId, text);
}

function setBodyTextCache(options: IContentDataProjectionOptions, storageId: string, text: string): void {
	const {bodyTextCache} = options;
	if (!bodyTextCache) {
		return;
	}

	const maxEntries = options.bodyTextCacheMaxEntries ?? defaultBodyTextCacheMaxEntries;
	if (maxEntries <= 0) {
		return;
	}

	if (bodyTextCache.has(storageId)) {
		touchBodyTextCache(bodyTextCache, storageId, text);
		return;
	}

	while (bodyTextCache.size >= maxEntries) {
		const oldestKey = bodyTextCache.keys().next().value;
		if (oldestKey === undefined) {
			break;
		}
		bodyTextCache.delete(oldestKey);
	}

	bodyTextCache.set(storageId, text);
}

export async function getProjectedContentText(
	storage: ContentTextStorage,
	content: IContent,
	options: IContentDataProjectionOptions = {}
): Promise<string> {
	const {storageId} = content;
	if (!storageId) {
		return '';
	}

	const cachedText = options.bodyTextCache?.get(storageId);
	if (cachedText !== undefined) {
		touchBodyTextCache(options.bodyTextCache, storageId, cachedText);
		return cachedText;
	}

	const text = await storage.getFileDataText(storageId);
	setBodyTextCache(options, storageId, text);
	return text;
}

export async function getProjectedContentRichText(
	storage: ContentTextStorage,
	content: IContent,
	options: IContentDataProjectionOptions = {}
): Promise<RichTextDocument | null> {
	if (!isProjectedRichTextContent(content)) {
		return null;
	}
	return contentTextToRichText(await getProjectedContentText(storage, content, options), String(content.mimeType || ''));
}

export function getProjectedContentRichTextPlainText(document: RichTextDocument | null): string {
	if (!document) {
		return '';
	}
	return richTextToPlainText(document);
}

export function isProjectedRichTextContent(content: IContent): boolean {
	return String(content?.mimeType || '').toLowerCase() === RICH_TEXT_MIME_TYPE;
}
