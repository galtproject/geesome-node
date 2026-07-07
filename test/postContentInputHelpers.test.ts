import assert from 'node:assert';
import {ContentView} from '../app/modules/database/interface.js';
import {getPostInputContents, stripPostContentInputFields} from '../app/modules/group/postContentInputHelpers.js';
import {RICH_TEXT_MIME_TYPE, createRichTextDocument} from '../app/richText.js';

describe('post content input helpers', () => {
	it('saves canonical rich-text post bodies as ordinary contents refs', async () => {
		const calls: any[] = [];
		const app = {
			ms: {
				content: {
					async saveData(userId, data, fileName, options) {
						calls.push({userId, data, fileName, options});
						return {
							id: 11,
							view: options.view,
							mimeType: options.mimeType
						};
					}
				}
			}
		};
		const richText = createRichTextDocument([{
			type: 'paragraph',
			children: [{text: 'Native body'}]
		}]);
		const attachmentRef = {id: 22, view: ContentView.Attachment} as any;
		const postData = {
			contentRichText: richText,
			contentRichTextFileName: 'body.json',
			contents: [attachmentRef]
		};

		const contents = await getPostInputContents(app as any, 7, postData);

		assert.deepEqual(contents, [{
			id: 11,
			view: ContentView.Contents,
			mimeType: RICH_TEXT_MIME_TYPE
		}, attachmentRef]);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].userId, 7);
		assert.equal(calls[0].data, JSON.stringify(richText));
		assert.equal(calls[0].fileName, 'body.json');
		assert.equal(calls[0].options.mimeType, RICH_TEXT_MIME_TYPE);
		assert.equal(calls[0].options.view, ContentView.Contents);
		assert.equal(calls[0].options.properties.source, 'group:contentRichText');
	});

	it('preserves legacy content refs when rich text is absent', async () => {
		const contentsRef = [{id: 33, view: ContentView.Contents}] as any;
		const app = {
			ms: {
				content: {
					async saveData() {
						throw new Error('unexpected_save');
					}
				}
			}
		};

		assert.equal(await getPostInputContents(app as any, 7, {contents: contentsRef}), contentsRef);
		assert.equal(await getPostInputContents(app as any, 7, {}), null);
	});

	it('rejects invalid rich-text body data before saving content', async () => {
		const app = {
			ms: {
				content: {
					async saveData() {
						throw new Error('unexpected_save');
					}
				}
			}
		};

		await assert.rejects(
			() => getPostInputContents(app as any, 7, {contentRichText: {type: 'bad'} as any}),
			/rich_text_document_invalid/
		);
	});

	it('strips API-only post body input fields before persistence', () => {
		const postData = {
			contentRichText: createRichTextDocument([]),
			contentRichTextFileName: 'body.json',
			contents: [{id: 44}],
			type: 'post'
		};

		stripPostContentInputFields(postData as any);

		assert.deepEqual(postData, {type: 'post'});
	});
});
