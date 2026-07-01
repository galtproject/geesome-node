import assert from 'node:assert';
import {
	RICH_TEXT_DOCUMENT_TYPE,
	RICH_TEXT_MIME_TYPE,
	RICH_TEXT_VERSION,
	assertRichTextDocument,
	createRichTextDocument,
	htmlToRichText,
	isRichTextDocument,
	richTextToActivityPubTags,
	richTextToAtProtoTextWithFacets,
	richTextToMatrixMessageContent,
	richTextToNostrTextNote,
	richTextToPlainText,
	richTextToSafeHtml,
	validateRichTextDocument
} from '../app/richText.js';

describe('richText helpers', () => {
	it('validates the canonical document shape and renders safe plain text/html', () => {
		const document = createRichTextDocument([
			{
				type: 'paragraph',
				children: [
					{text: 'Hello '},
					{text: 'safe', marks: [{type: 'strong'}]},
					{text: ' world', marks: [{type: 'link', href: 'https://example.com/post', title: 'Example'}]},
					{text: ' <tag>', marks: [{type: 'code'}]}
				]
			},
			{
				type: 'blockquote',
				children: [{text: 'quoted'}]
			},
			{
				type: 'codeBlock',
				text: 'x < y'
			},
			{
				type: 'list',
				ordered: false,
				items: [
					{type: 'listItem', children: [{text: 'one'}]},
					{type: 'listItem', children: [{text: 'two'}]}
				]
			},
			{
				type: 'attachment',
				storageId: 'bafy-image',
				mimeType: 'image/png',
				alt: 'image alt'
			}
		], {lang: 'en'});

		assert.equal(RICH_TEXT_DOCUMENT_TYPE, 'geesome.richText');
		assert.equal(RICH_TEXT_VERSION, 1);
		assert.equal(RICH_TEXT_MIME_TYPE, 'application/vnd.geesome.rich-text+json');
		assert.equal(isRichTextDocument(document), true);
		assert.deepEqual(validateRichTextDocument(document), []);
		assert.doesNotThrow(() => assertRichTextDocument(document));
		assert.equal(richTextToPlainText(document), 'Hello safe world <tag>\nquoted\nx < y\none\ntwo\nimage alt');

		const html = richTextToSafeHtml(document);
		assert.match(html, /^<p>/);
		assert.match(html, /<strong>safe<\/strong>/);
		assert.match(html, /<a[^>]+href="https:\/\/example\.com\/post"[^>]* title="Example"[^>]*> world<\/a>/);
		assert.match(html, /<code> &lt;tag&gt;<\/code>/);
		assert.match(html, /<blockquote>quoted<\/blockquote>/);
		assert.match(html, /<pre><code>x &lt; y<\/code><\/pre>/);
		assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
		assert.equal(html.includes('bafy-image'), false);
	});

	it('imports unsafe html into canonical rich text without preserving active content', () => {
		const document = htmlToRichText([
			'<p onclick="alert(1)">Hello <strong>safe post</strong></p>',
			'<script>window.__xss = true</script>',
			'<a href="javascript:alert(2)" onmouseover="alert(3)">bad link</a>',
			'<a href="https://example.com/safe" target="_blank" style="color:red">safe link</a>',
			'<a href="ipfs://bafybeigdyrzt">ipfs link</a>',
			'<iframe src="https://example.com/embed"></iframe>',
			'<span style="color:red">unstyled text</span>'
		].join(''));

		assert.equal(isRichTextDocument(document), true);
		assert.equal(richTextToPlainText(document), 'Hello safe post\nbad linksafe linkipfs linkunstyled text');
		assert.deepEqual(document.blocks[0], {
			type: 'paragraph',
			children: [
				{text: 'Hello '},
				{text: 'safe post', marks: [{type: 'strong'}]}
			]
		});
		assert.deepEqual(document.blocks[1], {
			type: 'paragraph',
			children: [
				{text: 'bad link'},
				{text: 'safe link', marks: [{type: 'link', href: 'https://example.com/safe'}]},
				{text: 'ipfs link', marks: [{type: 'link', href: 'ipfs://bafybeigdyrzt'}]},
				{text: 'unstyled text'}
			]
		});

		const html = richTextToSafeHtml(document);
		assert.equal(html.includes('<script'), false);
		assert.equal(html.includes('<iframe'), false);
		assert.equal(html.includes('onclick'), false);
		assert.equal(html.includes('onmouseover'), false);
		assert.equal(html.includes('javascript:'), false);
		assert.equal(html.includes('style='), false);
		assert.match(html, /<strong>safe post<\/strong>/);
		assert.match(html, /<a[^>]+href="https:\/\/example\.com\/safe"[^>]*>safe link<\/a>/);
		assert.match(html, /<a[^>]+href="ipfs:\/\/bafybeigdyrzt"[^>]*>ipfs link<\/a>/);
	});

	it('rejects unsafe links during validation and drops them during html rendering', () => {
		const document = createRichTextDocument([{
			type: 'paragraph',
			children: [{
				text: 'bad',
				marks: [{type: 'link', href: 'javascript:alert(1)'}]
			}]
		}]);

		assert.equal(isRichTextDocument(document), true);
		assert.equal(richTextToSafeHtml(document), '<p>bad</p>');

		const invalidDocument = {
			type: RICH_TEXT_DOCUMENT_TYPE,
			version: RICH_TEXT_VERSION,
			blocks: [{
				type: 'paragraph',
				children: [{
					text: 'bad',
					marks: [{type: 'link', href: 'javascript:alert(1)'}]
				}]
			}]
		};

		assert.deepEqual(validateRichTextDocument(invalidDocument), [
			'blocks[0].children[0].marks[0].href must use a safe absolute protocol'
		]);
		assert.throws(() => assertRichTextDocument(invalidDocument), /rich_text_document_invalid/);
	});

	it('removes unsafe optional mention and hashtag hrefs without dropping the text', () => {
		const document = createRichTextDocument([{
			type: 'paragraph',
			children: [
				{text: '@alice', marks: [{type: 'mention', id: 'alice', href: 'javascript:alert(1)'}]},
				{text: ' '},
				{text: '#safe', marks: [{type: 'hashtag', name: 'safe', href: 'https://example.com/tags/safe'}]}
			]
		}]);

		assert.deepEqual(document.blocks[0].children, [
			{text: '@alice', marks: [{type: 'mention', id: 'alice'}]},
			{text: ' '},
			{text: '#safe', marks: [{type: 'hashtag', name: 'safe', href: 'https://example.com/tags/safe'}]}
		]);
		assert.equal(isRichTextDocument(document), true);
		assert.equal(richTextToSafeHtml(document).includes('javascript:'), false);
		assert.match(richTextToSafeHtml(document), /<a[^>]+href="https:\/\/example\.com\/tags\/safe"[^>]*>#safe<\/a>/);
	});

	it('imports lists, blockquotes, code, and relative links deterministically', () => {
		const document = htmlToRichText([
			'<blockquote><em>quoted</em></blockquote>',
			'<pre><code>x &lt; y</code></pre>',
			'<ol><li>first</li><li><code>second</code></li></ol>',
			'<p><a href="/relative">relative</a></p>'
		].join(''));

		assert.deepEqual(document.blocks, [
			{
				type: 'blockquote',
				children: [{text: 'quoted', marks: [{type: 'em'}]}]
			},
			{
				type: 'codeBlock',
				text: 'x < y'
			},
			{
				type: 'list',
				ordered: true,
				items: [
					{type: 'listItem', children: [{text: 'first'}]},
					{type: 'listItem', children: [{text: 'second', marks: [{type: 'code'}]}]}
				]
			},
			{
				type: 'paragraph',
				children: [{text: 'relative'}]
			}
		]);
		assert.equal(richTextToSafeHtml(document).includes('/relative'), false);
	});

	it('exports ATProto-compatible text facets with UTF-8 byte offsets', () => {
		const document = createRichTextDocument([
			{
				type: 'paragraph',
				children: [
					{text: 'Hi 🌍 '},
					{text: 'site', marks: [{type: 'link', href: 'https://example.com/post'}]},
					{text: ' '},
					{text: '@alice', marks: [{type: 'mention', id: 'did:plc:alice123'}]},
					{text: ' '},
					{text: '#тег', marks: [{type: 'hashtag', name: 'тег'}]},
					{text: ' plain', marks: [{type: 'mention', id: 'alice'}]}
				]
			},
			{
				type: 'codeBlock',
				text: 'x < y'
			}
		]);
		const exported = richTextToAtProtoTextWithFacets(document);

		assert.equal(exported.text, 'Hi 🌍 site @alice #тег plain\nx < y');
		assert.deepEqual(exported.facets, [
			{
				$type: 'app.bsky.richtext.facet',
				index: {
					byteStart: 8,
					byteEnd: 12
				},
				features: [{
					$type: 'app.bsky.richtext.facet#link',
					uri: 'https://example.com/post'
				}]
			},
			{
				$type: 'app.bsky.richtext.facet',
				index: {
					byteStart: 13,
					byteEnd: 19
				},
				features: [{
					$type: 'app.bsky.richtext.facet#mention',
					did: 'did:plc:alice123'
				}]
			},
			{
				$type: 'app.bsky.richtext.facet',
				index: {
					byteStart: 20,
					byteEnd: 27
				},
				features: [{
					$type: 'app.bsky.richtext.facet#tag',
					tag: 'тег'
				}]
			}
		]);
	});

	it('drops unsupported ATProto facets while preserving text', () => {
		const document = createRichTextDocument([{
			type: 'paragraph',
			children: [
				{text: 'bad link', marks: [{type: 'link', href: 'javascript:alert(1)'}]},
				{text: ' '},
				{text: '#too long', marks: [{type: 'hashtag'}]}
			]
		}]);
		const exported = richTextToAtProtoTextWithFacets(document);

		assert.equal(exported.text, 'bad link #too long');
		assert.deepEqual(exported.facets, []);
		assert.deepEqual(richTextToAtProtoTextWithFacets({} as any), {
			text: '',
			facets: []
		});
	});

	it('exports ActivityPub tags for safe mentions and hashtags', () => {
		const document = createRichTextDocument([{
			type: 'paragraph',
			children: [
				{text: '@alice', marks: [{type: 'mention', name: 'alice', href: 'https://remote.example/users/alice'}]},
				{text: ' '},
				{text: '#geesome', marks: [{type: 'hashtag', name: 'geesome', href: 'https://social.example/tags/geesome'}]},
				{text: ' '},
				{text: '#local', marks: [{type: 'hashtag'}]},
				{text: ' '},
				{text: '@missing', marks: [{type: 'mention', name: 'missing'}]},
				{text: ' '},
				{text: '#bad tag', marks: [{type: 'hashtag'}]},
				{text: ' '},
				{text: '#geesome', marks: [{type: 'hashtag', name: 'geesome', href: 'https://social.example/tags/geesome'}]}
			]
		}]);

		assert.deepEqual(richTextToActivityPubTags(document), [
			{
				type: 'Mention',
				href: 'https://remote.example/users/alice',
				name: '@alice'
			},
			{
				type: 'Hashtag',
				href: 'https://social.example/tags/geesome',
				name: '#geesome'
			},
			{
				type: 'Hashtag',
				name: '#local'
			}
		]);
		assert.deepEqual(richTextToActivityPubTags({} as any), []);
	});

	it('exports Matrix message content with plain fallback and sanitized HTML', () => {
		const document = htmlToRichText([
			'<p>Hello <strong>Matrix</strong> <a href="https://example.com/post">link</a></p>',
			'<script>alert(1)</script>',
			'<p><a href="javascript:alert(2)">bad</a> <code>x &lt; y</code></p>'
		].join(''));

		assert.deepEqual(richTextToMatrixMessageContent(document), {
			msgtype: 'm.text',
			body: 'Hello Matrix link\nbad x < y',
			format: 'org.matrix.custom.html',
			formatted_body: '<p>Hello <strong>Matrix</strong> <a href="https://example.com/post">link</a></p><p>bad <code>x &lt; y</code></p>'
		});
		assert.deepEqual(richTextToMatrixMessageContent({} as any), {
			msgtype: 'm.text',
			body: ''
		});
	});

	it('exports Nostr-like text notes with protocol tags', () => {
		const publicKey = 'a'.repeat(64);
		const document = createRichTextDocument([{
			type: 'paragraph',
			children: [
				{text: 'Hello '},
				{text: 'site', marks: [{type: 'link', href: 'https://example.com/post'}]},
				{text: ' '},
				{text: '@alice', marks: [{type: 'mention', id: publicKey}]},
				{text: ' '},
				{text: '#geesome', marks: [{type: 'hashtag', name: 'GeeSome'}]},
				{text: ' '},
				{text: '@bad', marks: [{type: 'mention', id: 'npub1bad'}]},
				{text: ' '},
				{text: '#bad tag', marks: [{type: 'hashtag'}]},
				{text: ' '},
				{text: 'site', marks: [{type: 'link', href: 'https://example.com/post'}]}
			]
		}]);

		assert.deepEqual(richTextToNostrTextNote(document), {
			content: 'Hello site @alice #geesome @bad #bad tag site',
			tags: [
				['r', 'https://example.com/post'],
				['p', publicKey],
				['t', 'GeeSome']
			]
		});
		assert.deepEqual(richTextToNostrTextNote({} as any), {
			content: '',
			tags: []
		});
	});
});
