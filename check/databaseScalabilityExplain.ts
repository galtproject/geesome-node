/**
 * Database scalability review — Slice 5 (J20 EXPLAIN ANALYZE harness).
 *
 * Runs EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) against the canonical
 * timeline/unread/manifest/category/quota/static-ID queries and explicit
 * repair/fallback scans that the scalability review tracks, using the fixture seeded by
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
 *   FIXTURE_GROUP_ID=123 node --import tsx check/databaseScalabilityExplain.ts
 *   FIXTURE_GROUP_NAME=scalability-fixture node --import tsx check/databaseScalabilityExplain.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';
import {
  describeScalabilityTargetGroup,
  getScalabilityTargetGroup,
  getScalabilityTargetGroupSelector,
  parseOptionalPositiveInteger,
  renderScalabilityTargetGroupEnv,
} from './databaseScalabilityTarget.js';

const PAGE_LIMIT = 20;
const PAGE_OFFSET = 50000;

type Probe = { name: string; sql: string; replacements?: any; notes: string };
type TargetCategory = { id: number; name: string; source: string };
type SamplePost = { id: number; localId: number; manifestStorageId: string; publishedAt: Date };
type SampleAttachment = { postId: number; contentId: number };
type SampleContent = {
  id: number;
  storageId: string;
  largePreviewStorageId: string | null;
  mediumPreviewStorageId: string | null;
  smallPreviewStorageId: string | null;
};
type SampleStaticId = { staticId: string; dynamicId: string };

async function findCategoryById(sequelize: Sequelize, groupId: number, id: number): Promise<TargetCategory | null> {
  const [category] = (await sequelize.query(
    `SELECT category.id, category.name
       FROM categories AS category
       INNER JOIN "categoryGroups" pivot
         ON pivot."categoryId" = category.id AND pivot."groupId" = :groupId
       WHERE category.id = :id
       LIMIT 1`,
    {replacements: {groupId, id}, type: QueryTypes.SELECT},
  )) as TargetCategory[];

  if (!category) {
    return null;
  }

  return {...category, source: `id ${id}`};
}

async function findCategoryByName(sequelize: Sequelize, groupId: number, name: string): Promise<TargetCategory | null> {
  const [category] = (await sequelize.query(
    `SELECT category.id, category.name
       FROM categories AS category
       INNER JOIN "categoryGroups" pivot
         ON pivot."categoryId" = category.id AND pivot."groupId" = :groupId
       WHERE category.name = :name
       ORDER BY category.id ASC
       LIMIT 1`,
    {replacements: {groupId, name}, type: QueryTypes.SELECT},
  )) as TargetCategory[];

  if (!category) {
    return null;
  }

  return {...category, source: `name "${name}"`};
}

async function findAnyCategoryForGroup(sequelize: Sequelize, groupId: number): Promise<TargetCategory | null> {
  const [category] = (await sequelize.query(
    `SELECT category.id, category.name
       FROM categories AS category
       INNER JOIN "categoryGroups" pivot
         ON pivot."categoryId" = category.id AND pivot."groupId" = :groupId
       ORDER BY category.id ASC
       LIMIT 1`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as TargetCategory[];

  if (!category) {
    return null;
  }

  return {...category, source: 'first category attached to group'};
}

async function findTargetCategory(sequelize: Sequelize, groupId: number, groupName: string): Promise<TargetCategory | null> {
  const categoryId = parseOptionalPositiveInteger(process.env.FIXTURE_CATEGORY_ID, 'FIXTURE_CATEGORY_ID');
  if (categoryId !== null) {
    const category = await findCategoryById(sequelize, groupId, categoryId);
    if (!category) {
      throw new Error(`fixture/restored category id ${categoryId} is not attached to group id ${groupId}.`);
    }
    return category;
  }

  if (process.env.FIXTURE_CATEGORY_NAME) {
    const category = await findCategoryByName(sequelize, groupId, process.env.FIXTURE_CATEGORY_NAME);
    if (!category) {
      throw new Error(`fixture/restored category "${process.env.FIXTURE_CATEGORY_NAME}" is not attached to group id ${groupId}.`);
    }
    return category;
  }

  const fixtureCategory = await findCategoryByName(sequelize, groupId, `${groupName}-category`);
  if (fixtureCategory) {
    return fixtureCategory;
  }

  return findAnyCategoryForGroup(sequelize, groupId);
}

async function findSamplePost(sequelize: Sequelize, groupId: number, cursorOffset: number): Promise<SamplePost | null> {
  const [samplePost] = (await sequelize.query(
    `SELECT id, "localId", "manifestStorageId", "publishedAt" FROM posts
       WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
       ORDER BY "publishedAt" DESC LIMIT 1 OFFSET :cursorOffset`,
    {replacements: {groupId, cursorOffset}, type: QueryTypes.SELECT},
  )) as SamplePost[];

  return samplePost || null;
}

async function findSampleAttachment(sequelize: Sequelize, groupId: number): Promise<SampleAttachment | null> {
  const [sampleAttachment] = (await sequelize.query(
    `SELECT pc."postId", pc."contentId"
       FROM "postsContents" pc
       INNER JOIN posts post ON post.id = pc."postId"
       WHERE post."groupId" = :groupId
       ORDER BY post."publishedAt" DESC, post.id DESC, pc.position ASC
       LIMIT 1`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as SampleAttachment[];

  return sampleAttachment || null;
}

async function findSampleContent(
  sequelize: Sequelize,
  groupId: number,
  userId: number,
  sampleAttachment: SampleAttachment | null,
): Promise<SampleContent | null> {
  if (sampleAttachment) {
    const [attachedContent] = (await sequelize.query(
      `SELECT id, "storageId", "largePreviewStorageId", "mediumPreviewStorageId", "smallPreviewStorageId"
         FROM contents
         WHERE id = :contentId
         LIMIT 1`,
      {replacements: {contentId: sampleAttachment.contentId}, type: QueryTypes.SELECT},
    )) as SampleContent[];

    if (attachedContent) {
      return attachedContent;
    }
  }

  const [groupContent] = (await sequelize.query(
    `SELECT content.id, content."storageId", content."largePreviewStorageId", content."mediumPreviewStorageId", content."smallPreviewStorageId"
       FROM contents content
       INNER JOIN "postsContents" pc ON pc."contentId" = content.id
       INNER JOIN posts post ON post.id = pc."postId"
       WHERE post."groupId" = :groupId
       ORDER BY post."publishedAt" DESC, post.id DESC, pc.position ASC
       LIMIT 1`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as SampleContent[];

  if (groupContent) {
    return groupContent;
  }

  const [userContent] = (await sequelize.query(
    `SELECT id, "storageId", "largePreviewStorageId", "mediumPreviewStorageId", "smallPreviewStorageId"
       FROM contents
       WHERE "userId" = :userId AND "storageId" IS NOT NULL
       ORDER BY id ASC
       LIMIT 1`,
    {replacements: {userId}, type: QueryTypes.SELECT},
  )) as SampleContent[];

  return userContent || null;
}

async function findSampleStaticBinding(sequelize: Sequelize): Promise<SampleStaticId | null> {
  const [sampleStaticId] = (await sequelize.query(
    `SELECT "staticId", "dynamicId"
       FROM "staticIdBindings"
       WHERE "dynamicId" IS NOT NULL
       ORDER BY "boundAt" DESC NULLS LAST, id DESC
       LIMIT 1`,
    {type: QueryTypes.SELECT},
  )) as SampleStaticId[];

  return sampleStaticId || null;
}

async function findSampleStaticHistory(sequelize: Sequelize): Promise<SampleStaticId | null> {
  const [sampleStaticId] = (await sequelize.query(
    `SELECT "staticId", "dynamicId"
       FROM "staticIdHistories"
       WHERE "dynamicId" IS NOT NULL
       ORDER BY "boundAt" DESC NULLS LAST, id DESC
       LIMIT 1`,
    {type: QueryTypes.SELECT},
  )) as SampleStaticId[];

  return sampleStaticId || null;
}

async function main() {
  const targetSelector = getScalabilityTargetGroupSelector();
  const sequelize = new Sequelize({...(config as any), logging: false});
  await sequelize.authenticate();

  const group = await getScalabilityTargetGroup(sequelize, targetSelector);
  const groupId = group.id;
  const userId = group.creatorId;
  const [{count: publishedPostCount}] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count
       FROM posts
       WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as Array<{ count: number }>;
  const cursorOffset = Math.min(1000, Math.max(0, publishedPostCount - 1));

  const category = await findTargetCategory(sequelize, groupId, group.name);
  const samplePost = await findSamplePost(sequelize, groupId, cursorOffset);
  if (!samplePost) {
    throw new Error(`fixture/restored ${describeScalabilityTargetGroup(targetSelector)} has no published posts to sample.`);
  }

  const sampleAttachment = await findSampleAttachment(sequelize, groupId);
  const sampleContent = await findSampleContent(sequelize, groupId, userId, sampleAttachment);
  const sampleStaticBinding = await findSampleStaticBinding(sequelize);
  const sampleStaticHistory = await findSampleStaticHistory(sequelize);
  const skippedProbeNotes: string[] = [];
  const probes: Probe[] = [];

  probes.push(
    {
      name: 'Timeline page (Published, offset pagination)',
      notes: 'public group/:groupId/posts; expected to use posts_group_timeline_idx for the WHERE+ORDER and a small offset; large offsets are still expensive even with the index.',
      sql: `SELECT id, "publishedAt", "manifestStorageId" FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
              ORDER BY "publishedAt" DESC, "id" DESC LIMIT :limit OFFSET :offset`,
      replacements: {groupId, limit: PAGE_LIMIT, offset: PAGE_OFFSET},
    },
    {
      name: 'Timeline page (Published, cursor pagination)',
      notes: 'public group/:groupId/posts cursor path; expected to use posts_group_timeline_idx without a large OFFSET walk.',
      sql: `SELECT id, "publishedAt", "manifestStorageId" FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
                AND ("publishedAt", id) < (:cursorPublishedAt, :cursorId)
              ORDER BY "publishedAt" DESC, "id" DESC LIMIT :limit`,
      replacements: {groupId, limit: PAGE_LIMIT, cursorPublishedAt: samplePost.publishedAt, cursorId: samplePost.id},
    },
    {
      name: 'Unread count (publishedAtGt + group/timeline)',
      notes: 'getGroupUnreadPostsData; uses a publishedAt cursor and should hit posts_group_timeline_idx for the count.',
      sql: `SELECT COUNT(*)::int AS unread FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
                AND "publishedAt" > :readAt`,
      replacements: {groupId, readAt: samplePost.publishedAt},
    },
  );

  if (category) {
    probes.push(
      {
        name: 'Category feed page (category -> group -> published posts)',
        notes: `groupCategory.getCategoryPosts page selection; using category ${category.source}; expected to use category_groups_category_group_idx plus posts_group_timeline_idx before bounded hydration.`,
        sql: `SELECT post.id, post."publishedAt", post."groupId"
                FROM posts post
                INNER JOIN "categoryGroups" pivot ON pivot."groupId" = post."groupId"
                WHERE pivot."categoryId" = :categoryId
                  AND post."isDeleted" = false
                  AND post."status" = 'published'
                ORDER BY post."publishedAt" DESC, post.id DESC LIMIT :limit`,
        replacements: {categoryId: category.id, limit: PAGE_LIMIT},
      },
    );
  } else {
    skippedProbeNotes.push('Category feed page: target group is not attached to any category.');
  }

  probes.push(
    {
      name: 'Static-site/RSS newest post-ref scan',
      notes: 'staticSiteGenerator/RSS batch ref selection; expected to use posts_group_timeline_idx and avoid attachment joins before hydration.',
      sql: `SELECT id, "localId", "publishedAt"
              FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
              ORDER BY "publishedAt" DESC, id DESC LIMIT 500`,
      replacements: {groupId},
    },
    {
      name: 'Manifest differential rebuild (durable updatedAt cursor overlap)',
      notes: 'generateGroupManifest compatibility scan; the stored group cursor overlaps the updatedAt bucket, while batched progress uses (updatedAt,id). Expected to use posts_group_manifest_cursor_idx.',
      sql: `SELECT id, "localId", "manifestStorageId" FROM posts
              WHERE "groupId" = :groupId AND "status" = 'published' AND "updatedAt" >= :since
              ORDER BY "updatedAt", "id" LIMIT 1000`,
      replacements: {groupId, since: new Date(Date.now() - 60 * 60 * 1000)},
    },
    {
      name: 'Group local-post lookup (groupId, localId)',
      notes: 'getPostByGroupManifestIdAndLocalId; expected to use posts_group_local_unique.',
      sql: `SELECT id FROM posts WHERE "groupId" = :groupId AND "localId" = :localId LIMIT 1`,
      replacements: {groupId, localId: samplePost.localId},
    },
    {
      name: 'Post-by-manifest lookup',
      notes: 'getPostByParams({manifestStorageId}); expected to use posts_manifest_storage_id_idx.',
      sql: `SELECT id FROM posts WHERE "manifestStorageId" = :manifestStorageId LIMIT 1`,
      replacements: {manifestStorageId: samplePost.manifestStorageId},
    },
    {
      name: 'Group counter reconciliation scan (repair-only)',
      notes: 'reconcileGroupCounters repair path; normal post writes maintain group counters incrementally, so this full scan should stay an explicit audit/repair operation.',
      sql: `SELECT COUNT(*)::int AS posts, COALESCE(SUM("size"), 0)::bigint AS bytes FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'`,
      replacements: {groupId},
    },
    {
      name: 'Social-import reverse scan (groupId + idGte + published cursor)',
      notes: 'reversePostsLocalIds; expected to use the group timeline index for bounded ref batches.',
      sql: `SELECT id, "localId", "publishedAt" FROM posts
              WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published' AND "id" >= :idGte
              ORDER BY "publishedAt" ASC, id ASC LIMIT 500`,
      replacements: {groupId, idGte: 1},
    },
  );

  if (sampleAttachment) {
    probes.push(
      {
        name: 'Post-content hydration (postId, position)',
        notes: 'getPostPure / setPostContents; expected to use posts_contents_post_position_unique.',
        sql: `SELECT "postId", "contentId", "position" FROM "postsContents" WHERE "postId" = :postId ORDER BY "position"`,
        replacements: {postId: sampleAttachment.postId},
      },
      {
        name: 'Reverse content-to-post lookup',
        notes: 'reference-counted delete / cross-post listing; expected to use posts_contents_content_idx.',
        sql: `SELECT "postId" FROM "postsContents" WHERE "contentId" = :contentId LIMIT 100`,
        replacements: {contentId: sampleAttachment.contentId},
      },
    );
  } else {
    skippedProbeNotes.push('Post-content hydration and reverse content lookup: target group has no post attachments.');
  }

  if (sampleContent) {
    probes.push(
      {
        name: 'Content preview/header lookup by preview storage ID',
        notes: 'public file/preview metadata path; expected to use the preview storage indexes while shared lookup semantics remain deterministic.',
        sql: `SELECT id, "storageId", "largePreviewStorageId", "mediumPreviewStorageId", "smallPreviewStorageId"
                FROM contents
                WHERE "storageId" = :storageId
                   OR "largePreviewStorageId" = :storageId
                   OR "mediumPreviewStorageId" = :storageId
                   OR "smallPreviewStorageId" = :storageId
                ORDER BY id ASC LIMIT 1`,
        replacements: {storageId: sampleContent.largePreviewStorageId || sampleContent.mediumPreviewStorageId || sampleContent.smallPreviewStorageId || sampleContent.storageId},
      },
    );
  } else {
    skippedProbeNotes.push('Content preview/header lookup: no attached or creator-owned content row was available to sample.');
  }

  if (sampleStaticBinding) {
    probes.push(
      {
        name: 'Static-ID current binding by dynamicId',
        notes: 'getStaticIdItemByDynamicId hot path; expected to use static_id_bindings_dynamic_bound_idx before falling back to history.',
        sql: `SELECT "staticId", "dynamicId", "boundAt" FROM "staticIdBindings"
                WHERE "dynamicId" = :dynamicId ORDER BY "boundAt" DESC LIMIT 1`,
        replacements: {dynamicId: sampleStaticBinding.dynamicId},
      },
    );
  } else {
    skippedProbeNotes.push('Static-ID current binding: no current static-ID binding rows exist in this database.');
  }

  const staticHistorySample = sampleStaticHistory || sampleStaticBinding;
  if (staticHistorySample) {
    probes.push(
      {
        name: 'Static-ID history fallback by dynamicId',
        notes: 'upgraded-row fallback when a current binding has not been lazily created yet; expected to use static_id_histories_dynamic_bound_idx.',
        sql: `SELECT "staticId", "dynamicId", "boundAt" FROM "staticIdHistories"
                WHERE "dynamicId" = :dynamicId ORDER BY "boundAt" DESC LIMIT 1`,
        replacements: {dynamicId: staticHistorySample.dynamicId},
      },
    );
  } else {
    skippedProbeNotes.push('Static-ID history fallback: no static-ID binding or history rows exist in this database.');
  }

  probes.push(
    {
      name: 'Quota sum (userContentActions)',
      notes: 'getUserContentActionsSizeSum; flagged as needing (userId, name, createdAt) index.',
      sql: `SELECT COALESCE(SUM("size"), 0)::bigint AS bytes FROM "userContentActions"
              WHERE "userId" = :userId AND "name" = 'upload' AND "createdAt" >= :since`,
      replacements: {userId, since: new Date(0)},
    },
    {
      name: 'Creator-owned personal-chat group page',
      notes: 'getPersonalChatGroups / getCreatorInGroupsByType; expected to use groups_creator_type_deleted_created_idx for creatorId/type/isDeleted filters and default createdAt ordering.',
      sql: `SELECT id, name, "createdAt" FROM groups
              WHERE "creatorId" = :userId AND type = 'personal_chat' AND "isDeleted" = false
              ORDER BY "createdAt" DESC, id DESC LIMIT :limit`,
      replacements: {userId, limit: PAGE_LIMIT},
    },
  );

  const lines: string[] = [
    '# Database Scalability EXPLAIN ANALYZE Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Fixture/restored group: ${group.name} (id=${groupId}, creatorId=${userId}; selected by ${describeScalabilityTargetGroup(targetSelector)})`,
    '',
    'Run with:',
    '',
    '```',
    'npm run database:scalability:fixture',
    `${renderScalabilityTargetGroupEnv(targetSelector)} npm run database:scalability:explain`,
    '```',
    '',
    'Each probe shows the SQL, expected index it should hit, and the raw EXPLAIN (ANALYZE, BUFFERS) plan from Postgres. Plan numbers vary per run; this artifact is intentionally not committed. Optional fixture-only probes are skipped when the selected restored data does not have matching category, attachment, content, or static-ID rows.',
    '',
  ];

  if (skippedProbeNotes.length) {
    lines.push('## Skipped Probes', '');
    for (const note of skippedProbeNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

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
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`wrote ${path.relative(process.cwd(), outPath)}`);

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
