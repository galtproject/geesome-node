/**
 * Database scalability review - generated-output pressure report.
 *
 * This is a DB-side measurement companion for the large fixture and restored
 * production copies. It estimates whether static-site/RSS pressure is mostly
 * repeated text/json body reads, many unique body reads, or non-text storage
 * copy work. The report is intentionally gitignored under docs/.
 *
 * Run with:
 *   npm run database:scalability:fixture
 *   npm run database:scalability:generated-output
 *   FIXTURE_GROUP_ID=123 npm run database:scalability:generated-output
 *   FIXTURE_GROUP_NAME=my-group GENERATED_OUTPUT_POST_LIMIT=5000 npm run database:scalability:generated-output
 *   GROUP_MANIFEST_INLINE_POSTS_LIMIT=50000 npm run database:scalability:generated-output
 */

import fs from 'node:fs';
import path from 'node:path';
import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';
import {
  getScalabilityTargetGroup,
  getScalabilityTargetGroupSelector,
  renderScalabilityTargetGroupEnv,
} from './databaseScalabilityTarget.js';

const POST_LIMIT = parsePositiveInteger(process.env.GENERATED_OUTPUT_POST_LIMIT, 9999);
const TOP_DUPLICATES_LIMIT = parsePositiveInteger(process.env.GENERATED_OUTPUT_TOP_DUPLICATES, 10);
const MANIFEST_POST_INDEX_PAGE_SIZE = parsePositiveInteger(process.env.GENERATED_OUTPUT_MANIFEST_POST_INDEX_PAGE_SIZE, 1000);
const GROUP_MANIFEST_INLINE_POSTS_LIMIT = parseOptionalNonNegativeInteger(process.env.GROUP_MANIFEST_INLINE_POSTS_LIMIT);
const REPORT_PATH = process.env.GENERATED_OUTPUT_REPORT_PATH || 'docs/database-generated-output-pressure.md';
const BODY_MIME_PREDICATE = `("mimeType" ILIKE 'text/%' OR "mimeType" ILIKE '%json%')`;
const NON_TEXT_MIME_PREDICATE = `("mimeType" IS NOT NULL AND "mimeType" NOT ILIKE 'text/%')`;

type SummaryRow = {
  selected_posts: string | number;
  total_attachments: string | number;
  unique_attachment_storage_ids: string | number;
  static_body_read_candidates: string | number;
  static_unique_body_storage_ids: string | number;
  static_copy_candidates: string | number;
  static_unique_copy_storage_ids: string | number;
  static_preview_copy_candidates: string | number;
  static_unique_preview_storage_ids: string | number;
  rss_text_read_candidates: string | number;
  rss_unique_text_storage_ids: string | number;
};

type BreakdownRow = {
  mime_type: string;
  attachment_rows: string | number;
  unique_storage_ids: string | number;
};

type DuplicateBodyRow = {
  storage_id: string;
  mime_type: string;
  attachment_rows: string | number;
};

type ManifestPressureRow = {
  active_manifest_refs: string | number;
  missing_manifest_refs: string | number;
  local_id_high_water: string | number;
  unique_manifest_storage_ids: string | number;
  encrypted_refs: string | number;
  total_manifest_storage_id_bytes: string | number;
  average_manifest_storage_id_bytes: string | number;
  total_local_id_base36_bytes: string | number;
};

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(1, parsed);
}

function parseOptionalNonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}

function toNumber(value: string | number): number {
  return Number(value) || 0;
}

function formatRatio(part: number, total: number): string {
  if (total <= 0) {
    return '0.0%';
  }
  return `${(part * 100 / total).toFixed(1)}%`;
}

function repeatedReads(total: number, unique: number): number {
  return Math.max(0, total - unique);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value = value / 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function selectedPostSql(): string {
  return `
    WITH selected_posts AS (
      SELECT id
      FROM posts
      WHERE "groupId" = :groupId
        AND "isDeleted" = false
        AND "status" = 'published'
      ORDER BY "publishedAt" DESC, id DESC
      LIMIT :postLimit
    ),
    direct_attachments AS (
      SELECT
        selected_posts.id AS "postId",
        posts_contents.position,
        COALESCE(posts_contents.view, content.view, 'contents') AS view,
        content.id AS "contentId",
        content."storageId",
        content."mimeType",
        COALESCE(content."mediumPreviewStorageId", content."largePreviewStorageId", content."smallPreviewStorageId") AS "previewStorageId"
      FROM selected_posts
      INNER JOIN "postsContents" posts_contents
        ON posts_contents."postId" = selected_posts.id
      INNER JOIN contents content
        ON content.id = posts_contents."contentId"
    ),
    rss_text_candidates AS (
      SELECT
        "postId",
        "storageId",
        ROW_NUMBER() OVER (
          PARTITION BY "postId"
          ORDER BY
            CASE WHEN view = 'contents' THEN 0 ELSE 1 END,
            position ASC,
            "contentId" ASC
        ) AS row_number
      FROM direct_attachments
      WHERE "mimeType" ILIKE 'text/%'
    )
  `;
}

async function getSummary(sequelize: Sequelize, groupId: number): Promise<SummaryRow> {
  const [summary] = (await sequelize.query(
    `${selectedPostSql()}
    SELECT
      (SELECT COUNT(*)::int FROM selected_posts) AS selected_posts,
      COUNT(*)::int AS total_attachments,
      COUNT(DISTINCT "storageId")::int AS unique_attachment_storage_ids,
      COUNT(*) FILTER (WHERE ${BODY_MIME_PREDICATE})::int AS static_body_read_candidates,
      COUNT(DISTINCT "storageId") FILTER (WHERE ${BODY_MIME_PREDICATE})::int AS static_unique_body_storage_ids,
      COUNT(*) FILTER (WHERE ${NON_TEXT_MIME_PREDICATE})::int AS static_copy_candidates,
      COUNT(DISTINCT "storageId") FILTER (WHERE ${NON_TEXT_MIME_PREDICATE})::int AS static_unique_copy_storage_ids,
      COUNT(*) FILTER (WHERE ${NON_TEXT_MIME_PREDICATE} AND "previewStorageId" IS NOT NULL)::int AS static_preview_copy_candidates,
      COUNT(DISTINCT "previewStorageId") FILTER (WHERE ${NON_TEXT_MIME_PREDICATE} AND "previewStorageId" IS NOT NULL)::int AS static_unique_preview_storage_ids,
      (SELECT COUNT(*)::int FROM rss_text_candidates WHERE row_number = 1) AS rss_text_read_candidates,
      (SELECT COUNT(DISTINCT "storageId")::int FROM rss_text_candidates WHERE row_number = 1) AS rss_unique_text_storage_ids
    FROM direct_attachments`,
    {replacements: {groupId, postLimit: POST_LIMIT}, type: QueryTypes.SELECT},
  )) as SummaryRow[];
  return summary;
}

async function getMimeBreakdown(sequelize: Sequelize, groupId: number): Promise<BreakdownRow[]> {
  return (await sequelize.query(
    `${selectedPostSql()}
    SELECT
      COALESCE("mimeType", '') AS mime_type,
      COUNT(*)::int AS attachment_rows,
      COUNT(DISTINCT "storageId")::int AS unique_storage_ids
    FROM direct_attachments
    GROUP BY COALESCE("mimeType", '')
    ORDER BY attachment_rows DESC, mime_type ASC`,
    {replacements: {groupId, postLimit: POST_LIMIT}, type: QueryTypes.SELECT},
  )) as BreakdownRow[];
}

async function getDuplicateBodies(sequelize: Sequelize, groupId: number): Promise<DuplicateBodyRow[]> {
  return (await sequelize.query(
    `${selectedPostSql()}
    SELECT
      "storageId" AS storage_id,
      COALESCE("mimeType", '') AS mime_type,
      COUNT(*)::int AS attachment_rows
    FROM direct_attachments
    WHERE ${BODY_MIME_PREDICATE}
    GROUP BY "storageId", COALESCE("mimeType", '')
    HAVING COUNT(*) > 1
    ORDER BY attachment_rows DESC, storage_id ASC
    LIMIT :duplicatesLimit`,
    {replacements: {groupId, postLimit: POST_LIMIT, duplicatesLimit: TOP_DUPLICATES_LIMIT}, type: QueryTypes.SELECT},
  )) as DuplicateBodyRow[];
}

async function getManifestPressure(sequelize: Sequelize, groupId: number): Promise<ManifestPressureRow> {
  const [manifestPressure] = (await sequelize.query(
    `WITH active_refs AS (
      SELECT
        "localId",
        CASE
          WHEN "isEncrypted" = true THEN "encryptedManifestStorageId"
          ELSE "manifestStorageId"
        END AS "manifestRefStorageId",
        "isEncrypted"
      FROM posts
      WHERE "groupId" = :groupId
        AND "isDeleted" = false
        AND "status" = 'published'
        AND "localId" IS NOT NULL
    )
    SELECT
      COUNT(*) FILTER (WHERE "manifestRefStorageId" IS NOT NULL)::int AS active_manifest_refs,
      COUNT(*) FILTER (WHERE "manifestRefStorageId" IS NULL)::int AS missing_manifest_refs,
      COALESCE(MAX("localId"), 0)::int AS local_id_high_water,
      COUNT(DISTINCT "manifestRefStorageId") FILTER (WHERE "manifestRefStorageId" IS NOT NULL)::int AS unique_manifest_storage_ids,
      COUNT(*) FILTER (WHERE "isEncrypted" = true)::int AS encrypted_refs,
      COALESCE(SUM(LENGTH(COALESCE("manifestRefStorageId", ''))), 0)::bigint AS total_manifest_storage_id_bytes,
      COALESCE(AVG(LENGTH(COALESCE("manifestRefStorageId", ''))), 0)::numeric AS average_manifest_storage_id_bytes,
      COALESCE(SUM(
        CASE
          WHEN "localId" > 0 THEN FLOOR(LN("localId") / LN(36)) + 1
          ELSE 1
        END
      ), 0)::bigint AS total_local_id_base36_bytes
    FROM active_refs`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as ManifestPressureRow[];
  return manifestPressure;
}

function renderManifestPressureRows(manifestPressure: ManifestPressureRow): string[] {
  const activeManifestRefs = toNumber(manifestPressure.active_manifest_refs);
  const missingManifestRefs = toNumber(manifestPressure.missing_manifest_refs);
  const localIdHighWater = toNumber(manifestPressure.local_id_high_water);
  const uniqueManifestStorageIds = toNumber(manifestPressure.unique_manifest_storage_ids);
  const encryptedRefs = toNumber(manifestPressure.encrypted_refs);
  const totalManifestStorageIdBytes = toNumber(manifestPressure.total_manifest_storage_id_bytes);
  const totalLocalIdBase36Bytes = toNumber(manifestPressure.total_local_id_base36_bytes);
  const averageManifestStorageIdBytes = Number(manifestPressure.average_manifest_storage_id_bytes) || 0;
  const pageCount = Math.ceil(activeManifestRefs / MANIFEST_POST_INDEX_PAGE_SIZE);
  const inlineReferenceLowerBoundBytes = totalManifestStorageIdBytes + totalLocalIdBase36Bytes + activeManifestRefs * 8;
  const configuredLimit = GROUP_MANIFEST_INLINE_POSTS_LIMIT === null ? 'unset' : String(GROUP_MANIFEST_INLINE_POSTS_LIMIT);
  const generatedMode = GROUP_MANIFEST_INLINE_POSTS_LIMIT !== null && activeManifestRefs > GROUP_MANIFEST_INLINE_POSTS_LIMIT
    ? 'chunked-only with current env'
    : 'inline compatibility with current env';

  return [
    '',
    '## Group Manifest Pressure',
    '',
    '| Signal | Value | Notes |',
    '| --- | ---: | --- |',
    `| Active manifest refs | ${activeManifestRefs} | ${uniqueManifestStorageIds} unique manifest storage IDs; ${missingManifestRefs} refs missing manifest storage IDs |`,
    `| Local ID high-water | ${localIdHighWater} | Gaps are expected; this is identity high-water, not live count |`,
    `| Encrypted refs | ${encryptedRefs} | These use encrypted manifest refs when present |`,
    `| Inline reference lower bound | ${formatBytes(inlineReferenceLowerBoundBytes)} | Storage IDs + base36 local-ID keys + minimal JSON separators; actual trie JSON is larger |`,
    `| Average manifest storage ID bytes | ${averageManifestStorageIdBytes.toFixed(1)} | Useful for estimating page payload size on restored data |`,
    `| Paged postsIndex pages | ${pageCount} | ${MANIFEST_POST_INDEX_PAGE_SIZE} refs/page via GENERATED_OUTPUT_MANIFEST_POST_INDEX_PAGE_SIZE |`,
    `| GROUP_MANIFEST_INLINE_POSTS_LIMIT | ${configuredLimit} | This group would generate ${generatedMode} |`,
    '',
    'Chunked-only group manifests move the per-post refs out of the root manifest and into page manifests. Use this section on a restored large group before choosing a production default for `GROUP_MANIFEST_INLINE_POSTS_LIMIT`.',
  ];
}

function renderReport(
  group: {id: number; name: string},
  targetEnv: string,
  summary: SummaryRow,
  manifestPressure: ManifestPressureRow,
  breakdownRows: BreakdownRow[],
  duplicateBodyRows: DuplicateBodyRow[],
): string {
  const selectedPosts = toNumber(summary.selected_posts);
  const totalAttachments = toNumber(summary.total_attachments);
  const uniqueAttachments = toNumber(summary.unique_attachment_storage_ids);
  const staticBodyReads = toNumber(summary.static_body_read_candidates);
  const staticUniqueBodies = toNumber(summary.static_unique_body_storage_ids);
  const staticCopyCandidates = toNumber(summary.static_copy_candidates);
  const staticUniqueCopies = toNumber(summary.static_unique_copy_storage_ids);
  const staticPreviewCopies = toNumber(summary.static_preview_copy_candidates);
  const staticUniquePreviewCopies = toNumber(summary.static_unique_preview_storage_ids);
  const rssTextReads = toNumber(summary.rss_text_read_candidates);
  const rssUniqueTextBodies = toNumber(summary.rss_unique_text_storage_ids);

  const lines = [
    '# Database Generated Output Pressure Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Group: ${group.name} (id=${group.id})`,
    `Published post window: newest ${selectedPosts} posts (limit ${POST_LIMIT})`,
    '',
    'Run with:',
    '',
    '```',
    'npm run database:scalability:fixture',
    `${targetEnv} npm run database:scalability:generated-output`,
    '```',
    '',
    'This report is intentionally not committed. It uses database rows only, so it can run against the synthetic fixture or a restored production copy before deciding whether generated-output work needs persisted snippets, larger caches, storage-copy changes, or a chunked-only group-manifest cutoff.',
    '',
    '## Summary',
    '',
    '| Signal | Value | Notes |',
    '| --- | ---: | --- |',
    `| Attachment rows | ${totalAttachments} | ${uniqueAttachments} unique storage IDs (${formatRatio(uniqueAttachments, totalAttachments)} unique) |`,
    `| Static-site text/json body read candidates | ${staticBodyReads} | ${staticUniqueBodies} unique storage IDs; cache can avoid up to ${repeatedReads(staticBodyReads, staticUniqueBodies)} repeated reads |`,
    `| RSS selected text body read candidates | ${rssTextReads} | ${rssUniqueTextBodies} unique storage IDs; cache can avoid up to ${repeatedReads(rssTextReads, rssUniqueTextBodies)} repeated reads |`,
    `| Static-site non-text storage copy candidates | ${staticCopyCandidates} | ${staticUniqueCopies} unique storage IDs; repeated copies are the main copy-cache opportunity |`,
    `| Static-site preview copy candidates | ${staticPreviewCopies} | ${staticUniquePreviewCopies} unique preview storage IDs |`,
    '',
    '## MIME Breakdown',
    '',
    '| MIME type | Attachment rows | Unique storage IDs |',
    '| --- | ---: | ---: |',
  ];

  for (const row of breakdownRows) {
    lines.push(`| ${row.mime_type || '(empty)'} | ${toNumber(row.attachment_rows)} | ${toNumber(row.unique_storage_ids)} |`);
  }

  if (!breakdownRows.length) {
    lines.push('| (none) | 0 | 0 |');
  }

  lines.push('', '## Repeated Text/JSON Bodies', '', '| Storage ID | MIME type | Attachment rows |', '| --- | --- | ---: |');
  for (const row of duplicateBodyRows) {
    lines.push(`| ${row.storage_id} | ${row.mime_type || '(empty)'} | ${toNumber(row.attachment_rows)} |`);
  }

  if (!duplicateBodyRows.length) {
    lines.push('| (none) | | 0 |');
  }

  lines.push(...renderManifestPressureRows(manifestPressure));

  lines.push(
    '',
    '## Interpretation',
    '',
    '- If static/RSS unique body counts are close to total body reads, persisted snippets may help more than a larger in-memory cache.',
    '- If repeated body reads dominate, tune `GENERATED_OUTPUT_CACHE_LIMIT` / `RSS_BODY_CACHE_LIMIT` before adding stored snippets.',
    '- If non-text copy candidates dominate, generated-output pressure is storage copy work rather than database hydration or body projection.',
    '- If group manifest inline reference pressure dominates restored large groups, enable chunked-only manifests with `GROUP_MANIFEST_INLINE_POSTS_LIMIT` before making it the product default.',
    '',
  );

  return lines.join('\n');
}

async function main() {
  const targetSelector = getScalabilityTargetGroupSelector();
  const sequelize = new Sequelize({...(config as any), logging: false});
  try {
    await sequelize.authenticate();

    const group = await getScalabilityTargetGroup(sequelize, targetSelector);

    const summary = await getSummary(sequelize, group.id);
    const manifestPressure = await getManifestPressure(sequelize, group.id);
    const breakdownRows = await getMimeBreakdown(sequelize, group.id);
    const duplicateBodyRows = await getDuplicateBodies(sequelize, group.id);
    const report = renderReport(
      group,
      renderScalabilityTargetGroupEnv(targetSelector),
      summary,
      manifestPressure,
      breakdownRows,
      duplicateBodyRows,
    );
    const outPath = path.join(process.cwd(), REPORT_PATH);

    fs.mkdirSync(path.dirname(outPath), {recursive: true});
    fs.writeFileSync(outPath, report + '\n');
    console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
  } finally {
    await sequelize.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
