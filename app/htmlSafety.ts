import {load as cheerioLoad} from 'cheerio';

const allowedHtmlTags = new Set(['a', 'b', 'blockquote', 'br', 'code', 'em', 'i', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'u', 'ul']);
const blockedHtmlTags = new Set(['base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'math', 'meta', 'object', 'script', 'select', 'style', 'svg', 'textarea']);
const allowedHtmlProtocols = new Set(['http', 'https', 'ipfs', 'ipns', 'mailto']);
const allowedAnchorTargets = new Set(['_blank', '_parent', '_self', '_top']);

export function sanitizeHtml(html) {
	if (!html) {
		return '';
	}
	const $ = cheerioLoad(String(html), {decodeEntities: false}, false);
	const root = $.root();
	sanitizeHtmlChildren($, root);
	return normalizeHtml(root.html() || '');
}

export function htmlToText(html) {
	if (!html) {
		return '';
	}
	const $ = cheerioLoad(sanitizeHtml(html), {decodeEntities: false}, false);
	return $.root().text();
}

export function sanitizeHref(attributeValue) {
	const href = String(attributeValue || '').trim();
	if (!href) {
		return '';
	}
	const compactHref = href.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
	if (compactHref.startsWith('//')) {
		return '';
	}
	const protocolMatch = /^([a-z][a-z0-9+.-]*):/i.exec(compactHref);
	if (!protocolMatch) {
		return href;
	}
	if (!allowedHtmlProtocols.has(protocolMatch[1])) {
		return '';
	}
	return href;
}

export function sanitizeAbsoluteHref(attributeValue) {
	const href = sanitizeHref(attributeValue);
	if (!href) {
		return '';
	}
	if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
		return '';
	}
	return href;
}

export function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export function escapeHtmlAttribute(value) {
	return escapeHtml(value)
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function normalizeHtml(html) {
	html = String(html || '').trim().replace(/<\/?br\/?>/g, '<br/>').replace(/^(<\/?br\/?>)+|(<\/?br\/?>)+$/g, '');
	html = cheerioLoad(html, {xmlMode: true, decodeEntities: false}).html();
	return String(html || '').trim();
}

function sanitizeHtmlChildren($, parent) {
	parent.contents().each((index, element) => {
		sanitizeHtmlNode($, $(element));
	});
}

function sanitizeHtmlNode($, element) {
	const node = element[0];
	if (!node) {
		return;
	}
	if (node.type === 'comment' || node.type === 'script' || node.type === 'style') {
		element.remove();
		return;
	}
	if (node.type !== 'tag') {
		return;
	}

	const tagName = String(node.name || '').toLowerCase();
	if (blockedHtmlTags.has(tagName)) {
		element.remove();
		return;
	}

	sanitizeHtmlChildren($, element);
	if (!allowedHtmlTags.has(tagName)) {
		element.replaceWith(element.contents());
		return;
	}

	sanitizeHtmlAttributes(element, tagName);
}

function sanitizeHtmlAttributes(element, tagName) {
	const attributes = {...(element[0]?.attribs || {})};
	Object.keys(attributes).forEach(attributeName => {
		sanitizeHtmlAttribute(element, tagName, attributeName, attributes[attributeName]);
	});
	if (tagName === 'a' && element.attr('target') === '_blank') {
		element.attr('rel', 'noopener noreferrer');
	}
}

function sanitizeHtmlAttribute(element, tagName, attributeName, attributeValue) {
	const normalizedName = attributeName.toLowerCase();
	if (normalizedName.startsWith('on') || normalizedName === 'style') {
		element.removeAttr(attributeName);
		return;
	}
	if (tagName !== 'a' || !['href', 'rel', 'target', 'title'].includes(normalizedName)) {
		element.removeAttr(attributeName);
		return;
	}
	if (normalizedName === 'href') {
		sanitizeHrefAttribute(element, attributeName, attributeValue);
		return;
	}
	if (normalizedName === 'target') {
		sanitizeTargetAttribute(element, attributeName, attributeValue);
		return;
	}
	if (normalizedName === 'rel') {
		sanitizeRelAttribute(element, attributeName, attributeValue);
	}
}

function sanitizeHrefAttribute(element, attributeName, attributeValue) {
	const href = sanitizeHref(attributeValue);
	if (!href) {
		element.removeAttr(attributeName);
		return;
	}
	element.attr(attributeName, href);
}

function sanitizeTargetAttribute(element, attributeName, attributeValue) {
	const target = String(attributeValue || '').trim().toLowerCase();
	if (!allowedAnchorTargets.has(target)) {
		element.removeAttr(attributeName);
		return;
	}
	element.attr(attributeName, target);
}

function sanitizeRelAttribute(element, attributeName, attributeValue) {
	const rel = String(attributeValue || '')
		.split(/\s+/)
		.map(value => value.trim().toLowerCase())
		.filter(Boolean)
		.filter(value => /^[a-z0-9_-]+$/.test(value))
		.join(' ');
	if (!rel) {
		element.removeAttr(attributeName);
		return;
	}
	element.attr(attributeName, rel);
}

export default {
	sanitizeHtml,
	htmlToText,
	sanitizeHref,
	sanitizeAbsoluteHref,
	escapeHtml,
	escapeHtmlAttribute
};
