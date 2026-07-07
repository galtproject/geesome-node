import type {IGeesomeApp} from '../../interface.js';
import type {IContent} from '../database/interface.js';
import {ContentView} from '../database/interface.js';
import type {RichTextDocument} from '../../richText.js';
import {RICH_TEXT_MIME_TYPE, assertRichTextDocument} from '../../richText.js';

export type PostContentRichTextInput = {
	contentRichText?: RichTextDocument | null;
	contentRichTextFileName?: string;
	contents?: IContent[];
};

export async function getPostInputContents(app: IGeesomeApp, userId: number, postData: PostContentRichTextInput): Promise<IContent[] | null> {
	if (!hasContentRichTextInput(postData)) {
		return postData.contents || null;
	}
	const richTextContent = await createPostRichTextContent(app, userId, postData);
	return [richTextContent, ...(postData.contents || [])];
}

export function stripPostContentInputFields(postData: PostContentRichTextInput): void {
	delete postData.contents;
	delete postData.contentRichText;
	delete postData.contentRichTextFileName;
}

function hasContentRichTextInput(postData: PostContentRichTextInput): boolean {
	return postData.contentRichText !== undefined && postData.contentRichText !== null;
}

async function createPostRichTextContent(app: IGeesomeApp, userId: number, postData: PostContentRichTextInput): Promise<IContent> {
	const contentRichText = postData.contentRichText;
	assertRichTextDocument(contentRichText);
	return app.ms.content.saveData(
		userId,
		JSON.stringify(contentRichText),
		getPostRichTextContentFileName(postData),
		{
			mimeType: RICH_TEXT_MIME_TYPE,
			view: ContentView.Contents,
			properties: {
				source: 'group:contentRichText'
			}
		}
	);
}

function getPostRichTextContentFileName(postData: PostContentRichTextInput): string {
	if (typeof postData.contentRichTextFileName === 'string' && postData.contentRichTextFileName.trim()) {
		return postData.contentRichTextFileName.trim();
	}
	return 'post-rich-text.json';
}
