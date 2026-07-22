import type {
  ImageCompositionContentCreateInput,
  ImageCompositionUpdateInput,
  ResolvedImageComposition,
} from './contract.js';

export default interface IGeesomeImageCompositionModule {
  createImageCompositionContent(userId: number, input: ImageCompositionContentCreateInput): Promise<ResolvedImageComposition>;
  createImageCompositionContentRevision(userId: number, contentManifestId: string, input: ImageCompositionUpdateInput): Promise<ResolvedImageComposition>;
  getImageCompositionContent(userId: number, contentManifestId: string): Promise<ResolvedImageComposition>;
  getImageCompositionCatalogItems(userId: number, listParams?): Promise<any>;
  flushDatabase(): Promise<void>;
}
