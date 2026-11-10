import {Buffer} from 'node:buffer';
import {check} from './common.js';

// Text-only candidates; their URLs are never fetched. Indices are UTF-8 offsets.
export async function blueskyFacets(text: string, resolveHandle: any) {
	const spans: any[] = [];
	const overlaps = (start, end) => spans.some(span => start < span.end && end > span.start);
	const links = /https?:\/\/[^\s<>"`]+|(?<![\p{L}\p{N}_@.])(?:www\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[A-Za-z]{2,63}(?::[0-9]{1,5})?(?:\/[^\s<>"`]*)?/giu;
	for (const match of text.matchAll(links)) {
		let label = match[0].replace(/[.,!?;:]+$/, '');
		for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
			while (label.endsWith(close) && [...label].filter(c => c === close).length > [...label].filter(c => c === open).length) {
				label = label.slice(0, -1);
			}
		}
		label = label.replace(/[.,!?;:]+$/, '');
		try {
			const url = new URL(/^https?:\/\//i.test(label) ? label : `https://${label}`);
			if (!url.username && !url.password) {
				spans.push({start: match.index, end: match.index + label.length, feature: {$type: 'app.bsky.richtext.facet#link', uri: url.href}});
			}
		} catch {
			// An invalid link candidate remains ordinary text.
		}
	}
	for (const match of text.matchAll(/(?:^|[^\p{L}\p{N}_])@((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63})/gu)) {
		const start = match.index + match[0].indexOf('@'), end = start + match[1].length + 1;
		if (!overlaps(start, end)) {
			spans.push({start, end, handle: match[1]});
		}
	}
	for (const match of text.matchAll(/(?:^|[^\p{L}\p{N}_])#([\p{L}\p{M}\p{N}_]+)/gu)) {
		const start = match.index + match[0].indexOf('#'), end = start + match[1].length + 1;
		if (!overlaps(start, end) && !/^\p{N}+$/u.test(match[1]) && [...new Intl.Segmenter('en', {granularity: 'grapheme'}).segment(match[1])].length <= 64) {
			spans.push({start, end, feature: {$type: 'app.bsky.richtext.facet#tag', tag: match[1]}});
		}
	}
	const handles = [...new Set(spans.filter(span => span.handle).map(span => span.handle))];
	check(handles.length <= 20, 'Bluesky mention count exceeds limit');
	const dids = new Map<string, string>(await Promise.all(handles.map(async handle => [handle, await resolveHandle(handle)] as [string, string])));
	return spans.sort((a, b) => a.start - b.start).map(span => ({index: {byteStart: Buffer.byteLength(text.slice(0, span.start)), byteEnd: Buffer.byteLength(text.slice(0, span.end))},
		features: [span.feature || {$type: 'app.bsky.richtext.facet#mention', did: dids.get(span.handle)}]}));
}
