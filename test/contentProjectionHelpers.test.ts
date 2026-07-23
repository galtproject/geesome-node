import assert from 'node:assert';
import {RICH_TEXT_MIME_TYPE, createRichTextDocument} from '../app/richText.js';
import {
	getProjectedContentRichText,
	getProjectedContentRichTextPlainText,
	getProjectedContentText,
	isProjectedRichTextContent
} from '../app/modules/group/contentProjectionHelpers.js';

describe('content projection helpers', () => {
	it('projects canonical rich-text content through the shared text cache', async () => {
		const document = createRichTextDocument([{
			type: 'paragraph',
			children: [{text: 'Stored post body'}]
		}]);
		let readCount = 0;
		const storage = {
			async getFileDataText(storageId: string) {
				readCount += 1;
				assert.equal(storageId, 'rich-storage');
				return JSON.stringify(document);
			}
		};
		const content = {
			storageId: 'rich-storage',
			mimeType: RICH_TEXT_MIME_TYPE
		} as any;
		const options = {bodyTextCache: new Map<string, string>()};

		const projected = await getProjectedContentRichText(storage, content, options);

		assert.equal(isProjectedRichTextContent(content), true);
		assert.deepEqual(projected, document);
		assert.equal(getProjectedContentRichTextPlainText(projected), 'Stored post body');
		assert.equal(await getProjectedContentText(storage, content, options), JSON.stringify(document));
		assert.equal(readCount, 1);
	});

	it('ignores non-canonical or invalid rich-text content safely', async () => {
		const storage = {
			async getFileDataText() {
				return '{"type":"geesome.richText"}';
			}
		};

		assert.equal(isProjectedRichTextContent({mimeType: 'application/json'} as any), false);
		assert.equal(
			await getProjectedContentRichText(storage, {storageId: 'bad', mimeType: RICH_TEXT_MIME_TYPE} as any),
			null
		);
		assert.equal(getProjectedContentRichTextPlainText(null), '');
	});
});
