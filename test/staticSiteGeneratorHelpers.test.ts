import assert from 'assert';
import ssgHelpers from '../app/modules/staticSiteGenerator/helpers.js';

const {getTitleAndDescription, sanitizeStaticSiteHtml} = ssgHelpers;

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
});
