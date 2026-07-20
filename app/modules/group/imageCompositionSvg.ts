import {createHash} from 'node:crypto';

import {
	IMAGE_COMPOSITION_LIMITS,
	IMAGE_COMPOSITION_TEMPLATE,
	ImageCompositionStickerInput,
} from './imageCompositionContract.js';

export const IMAGE_COMPOSITION_TEMPLATE_VERSION = 1;

const SPEECH_VIEWBOX_WIDTH = 1000;
const SPEECH_TEXT_CENTER_X = 500;
const SPEECH_TEXT_CENTER_Y = 270;
const SPEECH_TEXT_WIDTH = 760;
const SPEECH_TEXT_HEIGHT = 340;
const INITIAL_WRAP_LENGTH = 24;

export interface ImageCompositionStickerSemanticInput {
	kind: string;
	template: string;
	templateVersion?: number;
	text: string;
}

export interface GeneratedImageCompositionStickerSvg {
	mimeType: 'image/svg+xml';
	templateVersion: number;
	semanticHash: string;
	svg: string;
	lines: string[];
}

export function generateImageCompositionStickerSvg(
	input: ImageCompositionStickerInput | ImageCompositionStickerSemanticInput,
): GeneratedImageCompositionStickerSvg {
	validateImageCompositionStickerSemanticInput(input);

	const templateVersion = IMAGE_COMPOSITION_TEMPLATE_VERSION;
	const lines = wrapStickerText(input.text);
	const semanticHash = getImageCompositionStickerSemanticHash({...input, templateVersion});
	const svg = renderSpeechBubbleSvg(lines);

	return {
		mimeType: 'image/svg+xml',
		templateVersion,
		semanticHash,
		svg,
		lines,
	};
}

export function getImageCompositionStickerSemanticHash(input: ImageCompositionStickerSemanticInput) {
	validateImageCompositionStickerSemanticInput(input);

	const canonicalSemanticJson = JSON.stringify({
		kind: input.kind,
		template: input.template,
		templateVersion: IMAGE_COMPOSITION_TEMPLATE_VERSION,
		text: input.text,
	});

	return `sha256:${createHash('sha256').update(canonicalSemanticJson, 'utf8').digest('hex')}`;
}

export function escapeImageCompositionXml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export function wrapImageCompositionStickerText(text: string) {
	validateText(text);
	return wrapStickerText(text);
}

export function validateImageCompositionStickerSemanticInput(
	input: unknown,
): asserts input is ImageCompositionStickerSemanticInput {
	if (!input || typeof input !== 'object') {
		throw new Error('composition_invalid');
	}

	const semanticInput = input as Partial<ImageCompositionStickerSemanticInput>;
	if (semanticInput.kind !== 'text-bubble') {
		throw new Error('composition_invalid');
	}
	if (semanticInput.template !== IMAGE_COMPOSITION_TEMPLATE) {
		throw new Error('composition_template_unknown');
	}
	if (
		semanticInput.templateVersion !== undefined
		&& semanticInput.templateVersion !== IMAGE_COMPOSITION_TEMPLATE_VERSION
	) {
		throw new Error('composition_version_unknown');
	}
	validateText(semanticInput.text);
}

function validateText(text: string) {
	if (typeof text !== 'string' || !text.trim()) {
		throw new Error('composition_invalid');
	}
	if (Array.from(text).length > IMAGE_COMPOSITION_LIMITS.maxTextLength) {
		throw new Error('composition_invalid');
	}
	if (!isValidXmlText(text)) {
		throw new Error('composition_invalid');
	}

	const explicitLines = normalizeLineEndings(text).split('\n');
	if (explicitLines.length > IMAGE_COMPOSITION_LIMITS.maxTextLines) {
		throw new Error('composition_invalid');
	}
}

function isValidXmlText(text: string) {
	return Array.from(text).every((character) => {
		const codePoint = character.codePointAt(0);
		return codePoint === 0x9
			|| codePoint === 0xa
			|| codePoint === 0xd
			|| (codePoint >= 0x20 && codePoint <= 0xd7ff)
			|| (codePoint >= 0xe000 && codePoint <= 0xfffd)
			|| (codePoint >= 0x10000 && codePoint <= 0x10ffff);
	});
}

function normalizeLineEndings(text: string) {
	return text.replace(/\r\n?/g, '\n');
}

function normalizeParagraph(paragraph: string) {
	return paragraph.replace(/[\t\f\v ]+/g, ' ').trim();
}

function wrapStickerText(text: string) {
	const paragraphs = normalizeLineEndings(text).split('\n').map(normalizeParagraph);
	const longestParagraphLength = Math.max(...paragraphs.map((paragraph) => Array.from(paragraph).length));

	for (let lineLength = INITIAL_WRAP_LENGTH; lineLength <= Math.max(INITIAL_WRAP_LENGTH, longestParagraphLength); lineLength++) {
		const lines = paragraphs.flatMap((paragraph) => wrapParagraph(paragraph, lineLength));
		if (lines.length <= IMAGE_COMPOSITION_LIMITS.maxTextLines) {
			return lines;
		}
	}

	throw new Error('composition_invalid');
}

function wrapParagraph(paragraph: string, lineLength: number) {
	if (!paragraph) {
		return [''];
	}

	const lines: string[] = [];
	let currentLine = '';

	for (const word of paragraph.split(' ')) {
		const wordParts = splitLongWord(word, lineLength);
		for (const wordPart of wordParts) {
			const candidate = currentLine ? `${currentLine} ${wordPart}` : wordPart;
			if (Array.from(candidate).length <= lineLength) {
				currentLine = candidate;
				continue;
			}
			lines.push(currentLine);
			currentLine = wordPart;
		}
	}

	if (currentLine) {
		lines.push(currentLine);
	}
	return lines;
}

function splitLongWord(word: string, lineLength: number) {
	const characters = Array.from(word);
	const parts: string[] = [];
	for (let offset = 0; offset < characters.length; offset += lineLength) {
		parts.push(characters.slice(offset, offset + lineLength).join(''));
	}
	return parts;
}

function renderSpeechBubbleSvg(lines: string[]) {
	const longestLineLength = Math.max(1, ...lines.map((line) => Array.from(line).length));
	const widthFontSize = Math.floor(SPEECH_TEXT_WIDTH / (longestLineLength * 0.58));
	const heightFontSize = Math.floor(SPEECH_TEXT_HEIGHT / (Math.max(1, lines.length) * 1.25));
	const fontSize = Math.max(1, Math.min(52, widthFontSize, heightFontSize));
	const lineHeight = Math.max(1, Math.floor(fontSize * 1.25));
	const firstBaseline = Math.floor(
		SPEECH_TEXT_CENTER_Y - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35,
	);
	const title = escapeImageCompositionXml(lines.join(' '));
	const textLines = lines.map((line, index) => {
		const y = firstBaseline + index * lineHeight;
		return `<tspan x="${SPEECH_TEXT_CENTER_X}" y="${y}">${escapeImageCompositionXml(line)}</tspan>`;
	}).join('');

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPEECH_VIEWBOX_WIDTH} 600" role="img">`,
		`<title>${title}</title>`,
		'<path d="M120 40H880C924 40 960 76 960 120V420C960 464 924 500 880 500H590L500 570L430 500H120C76 500 40 464 40 420V120C40 76 76 40 120 40Z" fill="#fff" stroke="#111" stroke-width="18" stroke-linejoin="round"/>',
		`<text x="${SPEECH_TEXT_CENTER_X}" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" font-weight="700" fill="#111">${textLines}</text>`,
		'</svg>',
	].join('');
}
