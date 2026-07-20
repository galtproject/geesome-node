import type {IListParams} from '../database/interface.js';
import type {
	ImageCompositionCreateInput,
	ImageCompositionUpdateInput,
	ResolvedImageComposition,
} from './contract.js';

export default interface IGeesomeImageCompositionModule {
	createImageComposition(userId: number, input: ImageCompositionCreateInput): Promise<ResolvedImageComposition>;
	updateImageComposition(userId: number, postId: number, input: ImageCompositionUpdateInput): Promise<ResolvedImageComposition>;
	getImageComposition(userId: number, postId: number): Promise<ResolvedImageComposition>;
	getImageCompositions(userId: number, groupId: number, filters?, listParams?: IListParams): Promise<{
		list: ResolvedImageComposition[];
		total: number | null;
		nextCursor?: any;
	}>;
	flushDatabase(): Promise<void>;
}
