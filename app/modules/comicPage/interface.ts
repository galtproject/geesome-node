import type {ComicPageInput, ComicPageReceipt} from './contract.js';
export default interface IGeesomeComicPageModule {
	create(userId: number, input: ComicPageInput): Promise<ComicPageReceipt>;
	detail(userId: number, manifest: string): Promise<ComicPageReceipt>;
	operation(userId: number, key: string): Promise<{status: string; canResume: boolean; receipt?: ComicPageReceipt; errorCode?: string}>;
	flushDatabase(): Promise<void>;
}
