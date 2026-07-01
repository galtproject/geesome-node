import {load as cheerioLoad} from 'cheerio';
import {escapeHtml, escapeHtmlAttribute, sanitizeAbsoluteHref, sanitizeHtml} from './htmlSafety.js';

export const RICH_TEXT_DOCUMENT_TYPE = 'geesome.richText';
export const RICH_TEXT_MIME_TYPE = 'application/vnd.geesome.rich-text+json';
export const RICH_TEXT_VERSION = 1;

const allowedBlockTypes = new Set(['paragraph', 'blockquote', 'codeBlock', 'list', 'listItem', 'lineBreak', 'attachment']);
const allowedMarkTypes = new Set(['strong', 'em', 'code', 'strike', 'spoiler', 'link', 'mention', 'hashtag']);
const markOrder = ['strong', 'em', 'code', 'strike', 'spoiler', 'link', 'mention', 'hashtag'];

export type RichTextMark = {
	type: string;
	href?: string;
	title?: string;
	summary?: string;
	id?: string;
	name?: string;
	protocol?: string;
};

export type RichTextInlineNode = {
	text: string;
	marks?: RichTextMark[];
};

export type RichTextBlock = {
	type: string;
	children?: RichTextInlineNode[];
	text?: string;
	language?: string;
	ordered?: boolean;
	items?: RichTextBlock[];
	storageId?: string;
	mimeType?: string;
	alt?: string;
	title?: string;
	size?: number;
	width?: number;
	height?: number;
};

export type RichTextDocument = {
	type: string;
	version: number;
	lang?: string;
	blocks: RichTextBlock[];
	attachments?: any[];
	source?: any;
};

export function createRichTextDocument(blocks: RichTextBlock[], options: any = {}): RichTextDocument {
	const document: RichTextDocument = {
		type: RICH_TEXT_DOCUMENT_TYPE,
		version: RICH_TEXT_VERSION,
		blocks: normalizeBlocks(blocks)
	};
	if (typeof options.lang === 'string' && options.lang) {
		document.lang = options.lang;
	}
	if (options.source && typeof options.source === 'object') {
		document.source = options.source;
	}
	if (Array.isArray(options.attachments)) {
		document.attachments = options.attachments;
	}
	return document;
}

export function htmlToRichText(html: string, options: any = {}): RichTextDocument {
	const sanitizedHtml = sanitizeHtml(html);
	const $ = cheerioLoad(sanitizedHtml, {decodeEntities: false}, false);
	const blocks = htmlNodesToBlocks($, $.root().contents().toArray());
	return createRichTextDocument(blocks, options);
}

export function richTextToPlainText(document: RichTextDocument): string {
	if (!isRichTextDocument(document)) {
		return '';
	}
	return document.blocks
		.map(block => richTextBlockToPlainText(block))
		.filter(text => text.length > 0)
		.join('\n');
}

export function richTextToSafeHtml(document: RichTextDocument): string {
	if (!isRichTextDocument(document)) {
		return '';
	}
	return sanitizeHtml(document.blocks.map(block => richTextBlockToHtml(block)).join(''));
}

export function isRichTextDocument(value: any): value is RichTextDocument {
	return validateRichTextDocument(value).length === 0;
}

export function assertRichTextDocument(value: any): asserts value is RichTextDocument {
	const errors = validateRichTextDocument(value);
	if (errors.length > 0) {
		throw new Error(`rich_text_document_invalid: ${errors.join(', ')}`);
	}
}

export function validateRichTextDocument(value: any): string[] {
	const errors: string[] = [];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return ['document must be an object'];
	}
	if (value.type !== RICH_TEXT_DOCUMENT_TYPE) {
		errors.push(`type must be ${RICH_TEXT_DOCUMENT_TYPE}`);
	}
	if (value.version !== RICH_TEXT_VERSION) {
		errors.push(`version must be ${RICH_TEXT_VERSION}`);
	}
	if (value.lang !== undefined && (typeof value.lang !== 'string' || value.lang.length > 64)) {
		errors.push('lang must be a short string');
	}
	if (!Array.isArray(value.blocks)) {
		errors.push('blocks must be an array');
		return errors;
	}
	value.blocks.forEach((block, index) => {
		validateRichTextBlock(block, `blocks[${index}]`, errors);
	});
	return errors;
}

function htmlNodesToBlocks($, nodes: any[]): RichTextBlock[] {
	const blocks: RichTextBlock[] = [];
	let inlineBuffer: RichTextInlineNode[] = [];

	nodes.forEach((node) => {
		const nodeBlocks = htmlNodeToBlocks($, node);
		if (nodeBlocks) {
			if (inlineBuffer.length > 0) {
				blocks.push({type: 'paragraph', children: normalizeInlineNodes(inlineBuffer)});
				inlineBuffer = [];
			}
			blocks.push(...nodeBlocks);
			return;
		}
		inlineBuffer.push(...htmlNodeToInlineNodes($, node, []));
	});

	if (inlineBuffer.length > 0) {
		blocks.push({type: 'paragraph', children: normalizeInlineNodes(inlineBuffer)});
	}

	return normalizeBlocks(blocks);
}

function htmlNodeToBlocks($, node: any): RichTextBlock[] | null {
	if (!node) {
		return null;
	}
	if (node.type !== 'tag') {
		return null;
	}

	const tagName = String(node.name || '').toLowerCase();
	const element = $(node);
	if (tagName === 'p') {
		return [{
			type: 'paragraph',
			children: normalizeInlineNodes(htmlNodesToInlineNodes($, element.contents().toArray(), []))
		}];
	}
	if (tagName === 'blockquote') {
		return [{
			type: 'blockquote',
			children: normalizeInlineNodes(htmlNodesToInlineNodes($, element.contents().toArray(), []))
		}];
	}
	if (tagName === 'pre') {
		return [{
			type: 'codeBlock',
			text: element.text()
		}];
	}
	if (tagName === 'ul' || tagName === 'ol') {
		return [{
			type: 'list',
			ordered: tagName === 'ol',
			items: element.children('li').toArray().map((child) => ({
				type: 'listItem',
				children: normalizeInlineNodes(htmlNodesToInlineNodes($, $(child).contents().toArray(), []))
			}))
		}];
	}
	if (tagName === 'br') {
		return [{type: 'lineBreak'}];
	}

	return null;
}

function htmlNodesToInlineNodes($, nodes: any[], marks: RichTextMark[]): RichTextInlineNode[] {
	return nodes.flatMap((node) => htmlNodeToInlineNodes($, node, marks));
}

function htmlNodeToInlineNodes($, node: any, marks: RichTextMark[]): RichTextInlineNode[] {
	if (!node) {
		return [];
	}
	if (node.type === 'text') {
		return [{
			text: node.data || '',
			marks: normalizeMarks(marks)
		}];
	}
	if (node.type !== 'tag') {
		return [];
	}

	const tagName = String(node.name || '').toLowerCase();
	if (tagName === 'br') {
		return [{text: '\n', marks: normalizeMarks(marks)}];
	}

	const mark = htmlTagToMark($, node, tagName);
	const nextMarks = mark ? marks.concat(mark) : marks;
	return htmlNodesToInlineNodes($, $(node).contents().toArray(), nextMarks);
}

function htmlTagToMark($, node: any, tagName: string): RichTextMark | null {
	if (tagName === 'strong' || tagName === 'b') {
		return {type: 'strong'};
	}
	if (tagName === 'em' || tagName === 'i') {
		return {type: 'em'};
	}
	if (tagName === 'code') {
		return {type: 'code'};
	}
	if (tagName === 's') {
		return {type: 'strike'};
	}
	if (tagName !== 'a') {
		return null;
	}

	const href = sanitizeAbsoluteHref($(node).attr('href'));
	if (!href) {
		return null;
	}
	const mark: RichTextMark = {
		type: 'link',
		href
	};
	const title = $(node).attr('title');
	if (title) {
		mark.title = title;
	}
	return mark;
}

function richTextBlockToPlainText(block: RichTextBlock): string {
	if (block.type === 'paragraph' || block.type === 'blockquote' || block.type === 'listItem') {
		return inlineNodesToPlainText(block.children || []);
	}
	if (block.type === 'codeBlock') {
		return String(block.text || '');
	}
	if (block.type === 'list') {
		return (block.items || []).map(item => richTextBlockToPlainText(item)).filter(Boolean).join('\n');
	}
	if (block.type === 'lineBreak') {
		return '\n';
	}
	if (block.type === 'attachment') {
		return block.alt || block.title || '';
	}
	return '';
}

function inlineNodesToPlainText(nodes: RichTextInlineNode[]): string {
	return nodes.map(node => String(node.text || '')).join('');
}

function richTextBlockToHtml(block: RichTextBlock): string {
	if (block.type === 'paragraph') {
		return `<p>${inlineNodesToHtml(block.children || [])}</p>`;
	}
	if (block.type === 'blockquote') {
		return `<blockquote>${inlineNodesToHtml(block.children || [])}</blockquote>`;
	}
	if (block.type === 'codeBlock') {
		return `<pre><code>${escapeHtml(block.text || '')}</code></pre>`;
	}
	if (block.type === 'list') {
		const tagName = block.ordered ? 'ol' : 'ul';
		const items = (block.items || []).map(item => richTextBlockToHtml({...item, type: 'listItem'})).join('');
		return `<${tagName}>${items}</${tagName}>`;
	}
	if (block.type === 'listItem') {
		return `<li>${inlineNodesToHtml(block.children || [])}</li>`;
	}
	if (block.type === 'lineBreak') {
		return '<br/>';
	}
	return '';
}

function inlineNodesToHtml(nodes: RichTextInlineNode[]): string {
	return nodes.map(node => inlineNodeToHtml(node)).join('');
}

function inlineNodeToHtml(node: RichTextInlineNode): string {
	let html = escapeHtml(node.text || '');
	normalizeMarks(node.marks || []).forEach((mark) => {
		html = applyMarkToHtml(html, mark);
	});
	return html;
}

function applyMarkToHtml(html: string, mark: RichTextMark): string {
	if (mark.type === 'strong') {
		return `<strong>${html}</strong>`;
	}
	if (mark.type === 'em') {
		return `<em>${html}</em>`;
	}
	if (mark.type === 'code') {
		return `<code>${html}</code>`;
	}
	if (mark.type === 'strike') {
		return `<s>${html}</s>`;
	}
	if (mark.type === 'link' || mark.type === 'mention' || mark.type === 'hashtag') {
		return linkMarkToHtml(html, mark);
	}
	return html;
}

function linkMarkToHtml(html: string, mark: RichTextMark): string {
	const href = sanitizeAbsoluteHref(mark.href);
	if (!href) {
		return html;
	}
	const title = mark.title ? ` title="${escapeHtmlAttribute(mark.title)}"` : '';
	return `<a href="${escapeHtmlAttribute(href)}"${title}>${html}</a>`;
}

function normalizeBlocks(blocks: RichTextBlock[]): RichTextBlock[] {
	return (blocks || [])
		.map(block => normalizeBlock(block))
		.filter(Boolean) as RichTextBlock[];
}

function normalizeBlock(block: RichTextBlock): RichTextBlock | null {
	if (!block || typeof block !== 'object') {
		return null;
	}
	if (block.type === 'paragraph' || block.type === 'blockquote' || block.type === 'listItem') {
		return {
			...block,
			children: normalizeInlineNodes(block.children || [])
		};
	}
	if (block.type === 'list') {
		return {
			...block,
			ordered: block.ordered === true,
			items: normalizeBlocks(block.items || []).filter(item => item.type === 'listItem')
		};
	}
	if (block.type === 'codeBlock') {
		return {
			...block,
			text: String(block.text || '')
		};
	}
	return block;
}

function normalizeInlineNodes(nodes: RichTextInlineNode[]): RichTextInlineNode[] {
	const normalized: RichTextInlineNode[] = [];
	(nodes || []).forEach((node) => {
		if (!node || typeof node.text !== 'string' || node.text.length === 0) {
			return;
		}
		const nextNode = {
			text: node.text,
			marks: normalizeMarks(node.marks || [])
		};
		const previousNode = normalized[normalized.length - 1];
		if (previousNode && getMarkSignature(previousNode.marks || []) === getMarkSignature(nextNode.marks)) {
			previousNode.text += nextNode.text;
			return;
		}
		if (nextNode.marks.length === 0) {
			delete nextNode.marks;
		}
		normalized.push(nextNode);
	});
	return normalized;
}

function normalizeMarks(marks: RichTextMark[]): RichTextMark[] {
	const normalized = (marks || [])
		.map(mark => normalizeMark(mark))
		.filter(Boolean) as RichTextMark[];
	return normalized.sort((a, b) => markOrder.indexOf(a.type) - markOrder.indexOf(b.type));
}

function normalizeMark(mark: RichTextMark): RichTextMark | null {
	if (!mark || !allowedMarkTypes.has(mark.type)) {
		return null;
	}
	if (mark.type === 'link' || mark.type === 'mention' || mark.type === 'hashtag') {
		return normalizeLinkLikeMark(mark);
	}
	return {...mark};
}

function normalizeLinkLikeMark(mark: RichTextMark): RichTextMark | null {
	const normalizedMark: RichTextMark = {...mark};
	if (normalizedMark.href) {
		const href = sanitizeAbsoluteHref(normalizedMark.href);
		if (href) {
			normalizedMark.href = href;
		} else {
			delete normalizedMark.href;
		}
	}
	if (mark.type === 'link' && !normalizedMark.href) {
		return null;
	}
	return normalizedMark;
}

function getMarkSignature(marks: RichTextMark[]): string {
	return JSON.stringify(normalizeMarks(marks || []));
}

function validateRichTextBlock(block: any, path: string, errors: string[]) {
	if (!block || typeof block !== 'object' || Array.isArray(block)) {
		errors.push(`${path} must be an object`);
		return;
	}
	if (!allowedBlockTypes.has(block.type)) {
		errors.push(`${path}.type is not supported`);
		return;
	}
	if (block.type === 'paragraph' || block.type === 'blockquote' || block.type === 'listItem') {
		validateRichTextInlineChildren(block.children, `${path}.children`, errors);
		return;
	}
	if (block.type === 'codeBlock') {
		if (typeof block.text !== 'string') {
			errors.push(`${path}.text must be a string`);
		}
		return;
	}
	if (block.type === 'list') {
		validateRichTextListBlock(block, path, errors);
		return;
	}
	if (block.type === 'attachment') {
		validateRichTextAttachmentBlock(block, path, errors);
	}
}

function validateRichTextListBlock(block: any, path: string, errors: string[]) {
	if (block.ordered !== undefined && typeof block.ordered !== 'boolean') {
		errors.push(`${path}.ordered must be a boolean`);
	}
	if (!Array.isArray(block.items)) {
		errors.push(`${path}.items must be an array`);
		return;
	}
	block.items.forEach((item, index) => {
		if (item?.type !== 'listItem') {
			errors.push(`${path}.items[${index}].type must be listItem`);
			return;
		}
		validateRichTextBlock(item, `${path}.items[${index}]`, errors);
	});
}

function validateRichTextAttachmentBlock(block: any, path: string, errors: string[]) {
	if (typeof block.storageId !== 'string' || !block.storageId) {
		errors.push(`${path}.storageId must be a non-empty string`);
	}
	if (block.mimeType !== undefined && typeof block.mimeType !== 'string') {
		errors.push(`${path}.mimeType must be a string`);
	}
}

function validateRichTextInlineChildren(children: any, path: string, errors: string[]) {
	if (!Array.isArray(children)) {
		errors.push(`${path} must be an array`);
		return;
	}
	children.forEach((node, index) => {
		validateRichTextInlineNode(node, `${path}[${index}]`, errors);
	});
}

function validateRichTextInlineNode(node: any, path: string, errors: string[]) {
	if (!node || typeof node !== 'object' || Array.isArray(node)) {
		errors.push(`${path} must be an object`);
		return;
	}
	if (typeof node.text !== 'string') {
		errors.push(`${path}.text must be a string`);
	}
	if (node.marks !== undefined) {
		validateRichTextMarks(node.marks, `${path}.marks`, errors);
	}
}

function validateRichTextMarks(marks: any, path: string, errors: string[]) {
	if (!Array.isArray(marks)) {
		errors.push(`${path} must be an array`);
		return;
	}
	marks.forEach((mark, index) => {
		validateRichTextMark(mark, `${path}[${index}]`, errors);
	});
}

function validateRichTextMark(mark: any, path: string, errors: string[]) {
	if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
		errors.push(`${path} must be an object`);
		return;
	}
	if (!allowedMarkTypes.has(mark.type)) {
		errors.push(`${path}.type is not supported`);
		return;
	}
	if (mark.type === 'link' && !sanitizeAbsoluteHref(mark.href)) {
		errors.push(`${path}.href must use a safe absolute protocol`);
	}
	if ((mark.type === 'mention' || mark.type === 'hashtag') && mark.href !== undefined && !sanitizeAbsoluteHref(mark.href)) {
		errors.push(`${path}.href must use a safe absolute protocol`);
	}
}

export default {
	RICH_TEXT_DOCUMENT_TYPE,
	RICH_TEXT_MIME_TYPE,
	RICH_TEXT_VERSION,
	createRichTextDocument,
	htmlToRichText,
	richTextToPlainText,
	richTextToSafeHtml,
	isRichTextDocument,
	assertRichTextDocument,
	validateRichTextDocument
};
