/**
 * Database scalability review — Slice 5 (J20 EXPLAIN ANALYZE harness).
 *
 * Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) against the canonical
 * timeline/unread/manifest/category/quota/static-ID queries that the
 * scalability review flags as hot paths, using the fixture seeded by
 * `database:scalability:fixture`.
 *
 * Output: writes a human-readable report to
 * `docs/database-scalability-explain.md`. The report is intentionally
 * gitignored — plan timings change per machine and per fixture state, so
 * each run produces a fresh artifact rather than a committed source of
 * truth.
 *
 * Run with:
 *   node --import tsx check/databaseScalabilityExplain.ts
 *   FIXTURE_GROUP_NAME=scalability-fixture node --import tsx check/databaseScalabilityExplain.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';

const GROUP_NAME = process.env.FIXTURE_GROUP_NAME || 'scalability-fixture';
const PAGE_LIMIT = 20;
const PAGE_OFFSET = 50000;

type Probe = { name: string; sql: string; replacements?: any; notes: string };

async function main() {
  const sequelize = new Sequelize({...(config as any), logging: false});
  await sequelize.authenticate();

  const [group] = (await sequelize.query(
    `SELECT id, "creatorId", "manifestStaticStorageId" FROM groups WHERE name = :name LIMIT 1`,
    {replacements: {name: GROUP_NAME}, type: QueryTypes.SELECT},
  )) as Array<{ id: number; creatorId: number; manifestStaticStorageId: string }>;
  if (!group) {
    console.error(`fixture group "${GROUP_NAME}" not found. Run 'npm run database:scalability:fixture' first.`);
    process.exit(1);
  }
  const groupId = group.id;
  const userId = group.creatorId;

  // Sample a real localId / manifestStorageId / publishedAt cursor from the fixture.
  const [sample] = (await sequelize.query(
    `SELECT "localId", "manifestStorageId", "publishedAt" FROM posts
       WHERE "groupId" = :groupId AND "status" = 'published'
       ORDER BY "publishedAt" DESC LIMIT 1 OFFSET 1000`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as Array<{ localId: number; manifestStorageId: string; publishedAt: Date }>;

  const probes: Probe[] = [
    {
      name: 'Timeline page (Published, offset pagination)',
      notes: 'public group/:groupId/posts; expected to use posts_group_timeline_idx for the WHERE+ORDER and a small offset; large offsets are still expensive even with the index.',
      sql: `SELECT id, "publishedAt", "manifestStorageId" FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
              ORDER BY "publishedAt" DESC, "id" DESC LIMIT :limit OFFSET :offset`,
      replacements: {groupId, limit: PAGE_LIMIT, offset: PAGE_OFFSET},
    },
    {
      name: 'Unread count (publishedAtGt + group/timeline)',
      notes: 'getGroupUnreadPostsData; uses a publishedAt cursor and should hit posts_group_timeline_idx for the count.',
      sql: `SELECT COUNT(*)::int AS unread FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
                AND "publishedAt" > :readAt`,
      replacements: {groupId, readAt: sample ? sample.publishedAt : new Date(0)},
    },
    {
      name: 'Manifest differential rebuild (updatedAtGte cursor)',
      notes: 'generateGroupManifest filter; expected to use posts_group_manifest_cursor_idx.',
      sql: `SELECT id, "localId", "manifestStorageId" FROM posts
              WHERE "groupId" = :groupId AND "status" = 'published' AND "updatedAt" >= :since
              ORDER BY "updatedAt", "id" LIMIT 1000`,
      replacements: {groupId, since: new Date(Date.now() - 60 * 60 * 1000)},
    },
    {
      name: 'Group local-post lookup (groupId, localId)',
      notes: 'getPostByGroupManifestIdAndLocalId; expected to use posts_group_local_idx.',
      sql: `SELECT id FROM posts WHERE "groupId" = :groupId AND "localId" = :localId LIMIT 1`,
      replacements: {groupId, localId: sample ? sample.localId : 1},
    },
    {
      name: 'Post-by-manifest lookup',
      notes: 'getPostByParams({manifestStorageId}); expected to use posts_manifest_storage_id_idx.',
      sql: `SELECT id FROM posts WHERE "manifestStorageId" = :manifestStorageId LIMIT 1`,
      replacements: {manifestStorageId: sample ? sample.manifestStorageId : 'fx-post-manifest-missing'},
    },
    {
      name: 'Group counters scan (sum size, count by groupId)',
      notes: 'updateGroupManifest currently runs SUM(size) and COUNT for every post write; needs incremental counters per the P1 finding. With C1 the COUNT now also filters status=Published.',
      sql: `SELECT COUNT(*)::int AS posts, COALESCE(SUM("size"), 0)::bigint AS bytes FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'`,
      replacements: {groupId},
    },
    {
      name: 'Social-import reverse scan (groupId + idGte)',
      notes: 'reversePostsLocalIds; expected to use posts_group_id_idx.',
      sql: `SELECT id, "localId" FROM posts WHERE "groupId" = :groupId AND "id" >= :idGte ORDER BY id LIMIT 1000`,
      replacements: {groupId, idGte: 1},
    },
    {
      name: 'Post-content hydration (postId, position)',
      notes: 'getPostPure / setPostContents; expected to use posts_contents_post_position_idx.',
      sql: `SELECT "postId", "contentId", "position" FROM "postsContents" WHERE "postId" = :postId ORDER BY "position"`,
      replacements: {postId: 1},
    },
    {
      name: 'Reverse content-to-post lookup',
      notes: 'reference-counted delete / cross-post listing; expected to use posts_contents_content_idx.',
      sql: `SELECT "postId" FROM "postsContents" WHERE "contentId" = :contentId LIMIT 100`,
      replacements: {contentId: 1},
    },
    {
      name: 'Static-ID resolution by dynamicId',
      notes: 'getStaticIdItemByDynamicId; flagged in the review as missing a dynamicId-leading index.',
      sql: `SELECT "staticId", "dynamicId", "boundAt" FROM "staticIdHistories"
              WHERE "dynamicId" = :dynamicId ORDER BY "boundAt" DESC LIMIT 1`,
      replacements: {dynamicId: 'fx-dynamic-missing'},
    },
    {
      name: 'Quota sum (userContentActions)',
      notes: 'getUserContentActionsSizeSum; flagged as needing (userId, name, createdAt) index.',
      sql: `SELECT COALESCE(SUM("size"), 0)::bigint AS bytes FROM "userContentActions"
              WHERE "userId" = :userId AND "name" = 'upload' AND "createdAt" >= :since`,
      replacements: {userId, since: new Date(0)},
    },
  ];

  const lines: string[] = [
    '# Database Scalability EXPLAIN ANALYZE Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Fixture group: ${GROUP_NAME} (id=${groupId}, creatorId=${userId})`,
    '',
    'Run with:',
    '',
    '```',
    'npm run database:scalability:fixture',
    'npm run database:scalability:explain',
    '```',
    '',
    'Each probe shows the SQL, expected index it should hit, and the raw EXPLAIN (ANALYZE, BUFFERS) plan from Postgres. Plan numbers vary per run; this artifact is intentionally not committed.',
    '',
  ];

  for (const probe of probes) {
    console.log(`probe: ${probe.name}`);
    lines.push(`## ${probe.name}`, '', `_${probe.notes}_`, '', '```sql', probe.sql.trim(), '```', '');
    try {
      const plan = (await sequelize.query(`EXPLAIN (ANALYZE, BUFFERS) ${probe.sql}`, {
        replacements: probe.replacements || {},
        type: QueryTypes.SELECT,
      })) as Array<Record<string, string>>;
      const text = plan.map((row) => Object.values(row)[0]).join('\n');
      lines.push('```', text, '```', '');
    } catch (e: any) {
      lines.push('```', `ERROR: ${e.message}`, '```', '');
    }
  }

  const outPath = path.join(process.cwd(), 'docs/database-scalability-explain.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`wrote ${path.relative(process.cwd(), outPath)}`);

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
