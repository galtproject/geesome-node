import assert from 'assert';
import {createRichTextDocument} from '../app/richText.js';
import ssgHelpers from '../app/modules/staticSiteGenerator/helpers.js';

const {getPostTitleAndDescription, getTitleAndDescription, sanitizeStaticSiteContents, sanitizeStaticSiteHtml} = ssgHelpers;

describe('staticSiteGenerator helpers', () => {
	it('sanitizes unsafe post html while preserving safe formatting and links', () => {
		const html = [
			'<p onclick="alert(1)">Hello <strong>safe</strong></p>',
			'<script>alert(2)</script>',
			'<a href="javascript:alert(3)" onmouseover="alert(4)">bad link</a>',
			'<a href="https://example.com" target="_blank" style="color:red">safe link</a>',
			'<a href="ipfs://bafybeigdyrzt">ipfs link</a>',
			'<iframe src="https://example.com/embed"></iframe>',
			'<span style="background:url(javascript:alert(5))">kept text</span>'
		].join('');
		const sanitized = sanitizeStaticSiteHtml(html);

		assert.equal(sanitized.includes('<script'), false);
		assert.equal(sanitized.includes('onclick'), false);
		assert.equal(sanitized.includes('onmouseover'), false);
		assert.equal(sanitized.includes('javascript:'), false);
		assert.equal(sanitized.includes('<iframe'), false);
		assert.equal(sanitized.includes('style='), false);
		assert.equal(sanitized.includes('<strong>safe</strong>'), true);
		assert.match(sanitized, /<a[^>]+href="https:\/\/example\.com"[^>]*>safe link<\/a>/);
		assert.match(sanitized, /<a[^>]+href="ipfs:\/\/bafybeigdyrzt"[^>]*>ipfs link<\/a>/);
		assert.match(sanitized, /<span>kept text<\/span>/);
	});

	it('sanitizes generated title and description html', () => {
		const {title, description} = getTitleAndDescription([{
			view: 'contents',
			text: [
				'Safe title<script>alert(1)</script>',
				'<a href="javascript:alert(2)">bad href</a>',
				'<a href="ipns://example-key/path">safe ipns</a>'
			].join('<br>')
		}], {
			titleLength: 10,
			descriptionLength: 200
		});

		assert.equal(title.includes('alert'), false);
		assert.equal(description.includes('<script'), false);
		assert.equal(description.includes('javascript:'), false);
		assert.match(description, /<a[^>]+href="ipns:\/\/example-key\/path"[^>]*>safe ipns<\/a>/);
	});

	it('renders canonical rich-text contents through the safe static-site html renderer', () => {
		const richText = createRichTextDocument([{
			type: 'paragraph',
			children: [
				{text: 'Rich '},
				{text: 'title', marks: [{type: 'strong'}]},
				{text: ' link', marks: [{type: 'link', href: 'https://example.com/post'}]},
				{text: ' bad', marks: [{type: 'link', href: 'javascript:alert(1)'} as any]}
			]
		}]);
		const [content] = sanitizeStaticSiteContents([{
			type: 'text',
			view: 'contents',
			text: '<script>alert(1)</script>',
			json: richText
		}]);

		assert.equal(content.text.includes('<script'), false);
		assert.equal(content.text.includes('javascript:'), false);
		assert.match(content.text, /<strong>title<\/strong>/);
		assert.match(content.text, /<a[^>]+href="https:\/\/example\.com\/post"[^>]*> link<\/a>/);

		const meta = getPostTitleAndDescription({}, [content], {
			titleLength: 200,
			descriptionLength: 200
		});

		assert.equal(meta.pageTitle, 'Rich title link bad');
		assert.match(meta.itemTitle, /Rich/);
		assert.match(meta.itemTitle, /title/);
		assert.equal(meta.itemTitle.includes('<script'), false);
		assert.equal(meta.itemDescription.includes('javascript:'), false);
	});

	it('falls back to sanitizing legacy text html when rich-text json is absent or invalid', () => {
		const contents = sanitizeStaticSiteContents([
			{
				type: 'text',
				view: 'contents',
				text: '<p onclick="x()">Legacy <em>html</em></p><script>x()</script>',
				json: {type: 'bad'}
			},
			{
				type: 'image',
				text: '<script>x()</script>'
			}
		]);

		assert.equal(contents[0].text, '<p>Legacy <em>html</em></p>');
		assert.equal(contents[1].text, '<script>x()</script>');
	});
});
