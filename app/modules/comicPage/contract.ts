export const COMIC_PAGE_LIMITS = Object.freeze({sources: 12, panels: 8, bubbles: 12, maxWidth: 1600, maxHeight: 2000, maxPngBytes: 20_000_000, maxRecipeBytes: 256_000});

export class ComicPageError extends Error {
	constructor(public errorCode: string, public status = 422) {
		super(errorCode);
	}
}

export interface ComicPageInput {
	idempotencyKey: string;
	comicId: string;
	pageId: string;
	pageRevision: number;
	previousVersionRef?: string | null;
	folderId: number;
	recipe: Record<string, any>;
	pngBase64: string;
	bubbles: Array<{id: string; svg: string}>;
}

export interface ComicPageReceipt {
	comicId: string;
	pageId: string;
	pageRevision: number;
	recipeHash: string;
	fileCatalogItemId: number;
	contentManifestId: string;
	storageId: string;
	previewStorageId: string;
	url: string;
	previewUrl: string;
	width: number;
	height: number;
	recipe: Record<string, any>;
	bubbles: Array<{id: string; contentManifestId: string; svgHash: string; url: string}>;
}
