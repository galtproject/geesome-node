import {load as cheerioLoad} from 'cheerio';

const allowedHtmlTags = new Set(['a', 'b', 'blockquote', 'br', 'code', 'em', 'i', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'u', 'ul']);
const layoutHtmlTags = new Set([...allowedHtmlTags, 'div', 'img']);
const blockedHtmlTags = new Set(['base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'math', 'meta', 'object', 'script', 'select', 'style', 'svg', 'textarea']);
const allowedHtmlProtocols = new Set(['http', 'https', 'ipfs', 'ipns', 'mailto']);
const allowedAnchorTargets = new Set(['_blank', '_parent', '_self', '_top']);

export function sanitizeHtml(html) {
	return sanitizeHtmlWithPolicy(html, false);
}

// Only site header/footer options use this policy; posts/messages remain text-only.
export function sanitizeStaticSiteLayoutHtml(html) {
	return sanitizeHtmlWithPolicy(html, true);
}

function sanitizeHtmlWithPolicy(html, layout: boolean) {
	if (!html) {
		return '';
	}
	const $ = cheerioLoad(String(html), {decodeEntities: false}, false);
	const root = $.root();
	sanitizeHtmlChildren($, root, layout);
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

function sanitizeHtmlChildren($, parent, layout: boolean) {
	parent.contents().each((index, element) => {
		sanitizeHtmlNode($, $(element), layout);
	});
}

function sanitizeHtmlNode($, element, layout: boolean) {
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

	sanitizeHtmlChildren($, element, layout);
	if (!(layout ? layoutHtmlTags : allowedHtmlTags).has(tagName)) {
		element.replaceWith(element.contents());
		return;
	}

	sanitizeHtmlAttributes(element, tagName, layout);
	if (tagName === 'img' && !element.attr('src')) {
		element.remove();
	}
}

function sanitizeHtmlAttributes(element, tagName, layout: boolean) {
	const attributes = {...(element[0]?.attribs || {})};
	Object.keys(attributes).forEach(attributeName => {
		sanitizeHtmlAttribute(element, tagName, attributeName, attributes[attributeName], layout);
	});
	if (tagName === 'a' && element.attr('target') === '_blank') {
		element.attr('rel', 'noopener noreferrer');
	}
}

function sanitizeHtmlAttribute(element, tagName, attributeName, attributeValue, layout: boolean) {
	const normalizedName = attributeName.toLowerCase();
	if (normalizedName.startsWith('on') || normalizedName === 'style') {
		element.removeAttr(attributeName);
		return;
	}
	if (layout && normalizedName === 'class') {
		const classes = String(attributeValue).split(/\s+/).filter(value => /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(value)).slice(0, 16);
		element.attr('class', classes.join(' '));
		return;
	}
	if (layout && tagName === 'img' && normalizedName === 'src') {
		const source = safeLayoutImageSource(attributeValue);
		if (!source) {
			element.removeAttr(attributeName);
			return;
		}
		element.attr('src', source);
		return;
	}
	if (layout && tagName === 'img' && ['alt', 'title'].includes(normalizedName)) {
		element.attr(attributeName, String(attributeValue).slice(0, 512));
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

function safeLayoutImageSource(value): string {
	const source = String(value || '').trim();
	if (!/^https?:\/\//i.test(source) || /[\\\u0000-\u0020\u007f]/.test(source)) {
		return '';
	}
	try {
		const url = new URL(source);
		if (url.username || url.password || !url.hostname) {
			return '';
		}
		return url.href;
	} catch {
		return '';
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
