export type PublicationVariantMetrics = {
	mode: 'clone' | 'fresh';
	reason: 'forced' | 'inventory' | 'adapter' | 'root-unavailable' | null;
	assemblyMs: number;
	totalMs: number;
};

export type PublicationBuildMetrics = {
	version: 2;
	renders: number;
	renderMs: number;
	bodySaves: number;
	generatedHtmlBytes: number;
	fileCacheHits: number;
	generatedBodyBytes: number;
	copies: number;
	mkdirs: number;
	removes: number;
	sourceStats: number;
	rootReads: number;
	sourceMs: number;
	prepareMs: number;
	variants: Partial<Record<'public' | 'full', PublicationVariantMetrics>>;
};

export type PublicationAttemptMetrics = PublicationBuildMetrics & {
	queueMs: number;
	jobAgeMs: number;
	leaseUpdates: number;
	commitMs?: number;
	buildToReadyMs?: number;
	queueToReadyMs?: number;
};

export function createPublicationBuildMetrics(): PublicationBuildMetrics {
	return {version: 2, renders: 0, renderMs: 0, bodySaves: 0, generatedHtmlBytes: 0, fileCacheHits: 0, generatedBodyBytes: 0, copies: 0, mkdirs: 0, removes: 0, sourceStats: 0, rootReads: 0, sourceMs: 0, prepareMs: 0, variants: {}};
}
