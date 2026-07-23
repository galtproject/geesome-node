import {
	buildBlueskyAuthorFeedUrl,
	defaultBlueskyOfficialHandle,
	defaultBlueskyPublicApiOrigin,
	fetchBlueskyAuthorFeed,
	getBlueskyProjectionPreview,
	normalizeBlueskyActor,
	projectBlueskyAuthorFeed
} from '../app/modules/bluesky/helpers.js';
import {getSmokeReportPathEnvDescription, printSmokeReport as writeSmokeReport} from './helpers/smokeReport.js';

const smokeReportPathEnvName = 'BLUESKY_ATPROTO_SMOKE_REPORT_PATH';

async function run(): Promise<void> {
	if (process.argv.includes('-h') || process.argv.includes('--help')) {
		printUsage();
		return;
	}

	const options = getSmokeOptions();
	const feedResponse = await fetchBlueskyAuthorFeed(options);
	const projections = projectBlueskyAuthorFeed(feedResponse);
	if (projections.length === 0) {
		printSmokeReport({
			ok: true,
			skipped: true,
			reason: 'bluesky_atproto_public_feed_empty',
			handle: options.actor,
			origin: options.origin,
			url: buildBlueskyAuthorFeedUrl(options)
		});
		return;
	}

	printSmokeReport({
		ok: true,
		skipped: false,
		handle: options.actor,
		origin: options.origin,
		url: buildBlueskyAuthorFeedUrl(options),
		cursor: feedResponse?.cursor || null,
		checked: projections.map(projection => getBlueskyProjectionPreview(projection))
	});
}

function getSmokeOptions() {
	return {
		actor: normalizeBlueskyActor(process.env.BLUESKY_ATPROTO_SMOKE_HANDLE || defaultBlueskyOfficialHandle),
		origin: process.env.BLUESKY_ATPROTO_SMOKE_ORIGIN || defaultBlueskyPublicApiOrigin,
		limit: parsePositiveInteger(process.env.BLUESKY_ATPROTO_SMOKE_LIMIT, 3),
		timeoutMs: parsePositiveInteger(process.env.BLUESKY_ATPROTO_SMOKE_TIMEOUT_MS, 15000)
	};
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(String(value || ''), 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}

function printSmokeReport(report): void {
	writeSmokeReport(report, smokeReportPathEnvName);
}

function printUsage(): void {
	console.log(`Usage:
  npm run bluesky:atproto-smoke
  BLUESKY_ATPROTO_SMOKE_HANDLE=bsky.app npm run bluesky:atproto-smoke

Fetches a public Bluesky account feed through native ATProto/XRPC and projects
the returned app.bsky.feed.post records into GeeSome source identity and
canonical rich-text metadata. This is a bridge-free read smoke only; it does not
write to the database, import posts, or cross-post content.

Environment:
  BLUESKY_ATPROTO_SMOKE_HANDLE      Bluesky handle or DID, default bsky.app
  BLUESKY_ATPROTO_SMOKE_ORIGIN      Public ATProto API, default https://public.api.bsky.app
  BLUESKY_ATPROTO_SMOKE_LIMIT       Posts to inspect, default 3, max 100
  BLUESKY_ATPROTO_SMOKE_TIMEOUT_MS  Fetch timeout, default 15000
  ${getSmokeReportPathEnvDescription(smokeReportPathEnvName)}`);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
