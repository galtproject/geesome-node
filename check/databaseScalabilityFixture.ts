/**
 * Database scalability review — Slice 5 (J20 fixture).
 *
 * Seeds a large-group fixture in the configured Postgres for benchmarking
 * timeline/unread/manifest/category/quota/static-ID queries against
 * EXPLAIN ANALYZE.
 *
 * Default fixture shape (all parameters can be overridden by env vars):
 * - 1 user (idempotent)
 * - 1 group (`scalability-fixture` by name)
 * - 1 category containing that group
 * - 1k content rows
 * - 100k posts in the fixture group, ~30% with attached content
 * - quota/static-ID side rows so EXPLAIN probes hit realistic data
 *
 * Env overrides:
 *   FIXTURE_POSTS=100000
 *   FIXTURE_CONTENTS=1000
 *   FIXTURE_ATTACH_RATIO=0.3
 *   FIXTURE_GROUP_NAME=scalability-fixture
 *   FIXTURE_RESET=true        # drops the existing fixture group rows first
 *
 * Run with:
 *   node --import tsx check/databaseScalabilityFixture.ts
 *   FIXTURE_RESET=true node --import tsx check/databaseScalabilityFixture.ts
 *
 * The script uses raw bulk-insert SQL on a fresh Sequelize instance and
 * intentionally bypasses the application layer (no createPost,
 * updatePostManifest, etc.) so 100k rows land in seconds rather than
 * triggering manifest/static work per post.
 */

import {Sequelize, QueryTypes} from 'sequelize';
import config from '../app/modules/database/config.js';

const POST_COUNT = parseInt(process.env.FIXTURE_POSTS || '100000', 10);
const CONTENT_COUNT = parseInt(process.env.FIXTURE_CONTENTS || '1000', 10);
const ATTACH_RATIO = parseFloat(process.env.FIXTURE_ATTACH_RATIO || '0.3');
const GROUP_NAME = process.env.FIXTURE_GROUP_NAME || 'scalability-fixture';
const CATEGORY_NAME = process.env.FIXTURE_CATEGORY_NAME || `${GROUP_NAME}-category`;
const RESET = (process.env.FIXTURE_RESET || '').toLowerCase() === 'true';
const BATCH = 5000;

function nowMinus(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

async function seedFixtureCategory(sequelize: Sequelize, groupId: number) {
  const [existingCategory] = (await sequelize.query(
    `SELECT id FROM categories WHERE name = :name LIMIT 1`,
    {replacements: {name: CATEGORY_NAME}, type: QueryTypes.SELECT},
  )) as Array<{ id: number }>;
  let categoryId = existingCategory?.id;
  if (!categoryId) {
    const [created] = (await sequelize.query(
      `INSERT INTO categories (name, title, "isGlobal", "createdAt", "updatedAt")
         VALUES (:name, :title, true, NOW(), NOW())
       RETURNING id`,
      {replacements: {name: CATEGORY_NAME, title: 'Scalability fixture category'}, type: QueryTypes.INSERT},
    )) as any;
    categoryId = (created[0] as any).id;
  }
  await sequelize.query(
    `INSERT INTO "categoryGroups" ("categoryId", "groupId", "createdAt", "updatedAt")
       SELECT :categoryId, :groupId, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM "categoryGroups"
         WHERE "categoryId" = :categoryId AND "groupId" = :groupId
       )`,
    {replacements: {categoryId, groupId}},
  );
  console.log(`fixture category id=${categoryId} includes group id=${groupId}`);
  return categoryId;
}

async function seedStaticIdState(sequelize: Sequelize, groupId: number) {
  const staticId = `fixture-static-${GROUP_NAME}`;
  const dynamicId = `fixture-dynamic-${GROUP_NAME}`;
  await sequelize.query(
    `UPDATE groups
       SET "manifestStorageId" = :manifestStorageId,
           "manifestStaticStorageId" = :staticId,
           "staticStorageId" = :staticId,
           "staticStorageUpdatedAt" = NOW(),
           "updatedAt" = NOW()
       WHERE id = :groupId`,
    {replacements: {groupId, staticId, manifestStorageId: dynamicId}},
  );
  await sequelize.query(
    `INSERT INTO "staticIdHistories" ("staticId", "dynamicId", "isActive", "boundAt", "createdAt", "updatedAt")
       VALUES (:staticId, :dynamicId, true, NOW(), NOW(), NOW())
       ON CONFLICT ("staticId", "dynamicId") DO UPDATE
       SET "isActive" = true,
           "boundAt" = EXCLUDED."boundAt",
           "updatedAt" = NOW()`,
    {replacements: {staticId, dynamicId}},
  );
  await sequelize.query(
    `INSERT INTO "staticIdBindings" ("staticId", "dynamicId", "isActive", "boundAt", "createdAt", "updatedAt")
       VALUES (:staticId, :dynamicId, true, NOW(), NOW(), NOW())
       ON CONFLICT ("staticId") DO UPDATE
       SET "dynamicId" = EXCLUDED."dynamicId",
           "isActive" = true,
           "boundAt" = EXCLUDED."boundAt",
           "updatedAt" = NOW()`,
    {replacements: {staticId, dynamicId}},
  );
  console.log(`fixture static id ${staticId} -> ${dynamicId}`);
}

async function normalizeFixturePreviewIds(sequelize: Sequelize, userId: number) {
  await sequelize.query(
    `UPDATE contents
       SET "largePreviewStorageId" = COALESCE("largePreviewStorageId", 'fx-large-preview-' || id::text),
           "mediumPreviewStorageId" = COALESCE("mediumPreviewStorageId", 'fx-medium-preview-' || id::text),
           "smallPreviewStorageId" = COALESCE("smallPreviewStorageId", 'fx-small-preview-' || id::text),
           "previewMimeType" = COALESCE("previewMimeType", "mimeType"),
           "previewExtension" = COALESCE("previewExtension", "extension"),
           "updatedAt" = NOW()
       WHERE "userId" = :userId AND name LIKE 'fx-content-%'`,
    {replacements: {userId}},
  );
}

async function seedUserContentActions(sequelize: Sequelize, userId: number, contentRows: Array<{id: number; size: string | number}>) {
  if (!contentRows.length) {
    console.log('no fixture content rows available for upload actions');
    return;
  }

  const existingRows = (await sequelize.query(
    `SELECT "contentId" FROM "userContentActions"
       WHERE "userId" = :userId AND name = 'upload' AND "contentId" IN (:contentIds)`,
    {replacements: {userId, contentIds: contentRows.map(row => row.id)}, type: QueryTypes.SELECT},
  )) as Array<{ contentId: number }>;
  const existingContentIds = new Set(existingRows.map(row => row.contentId));
  const missingRows = contentRows.filter(row => !existingContentIds.has(row.id));
  if (!missingRows.length) {
    console.log(`reusing ${existingRows.length} upload action rows`);
    return;
  }

  console.log(`creating ${missingRows.length} upload action rows`);
  let created = 0;
  while (created < missingRows.length) {
    const batchRows = missingRows.slice(created, created + BATCH);
    const values: string[] = [];
    const replacements: any = {userId};
    for (let i = 0; i < batchRows.length; i++) {
      replacements[`contentId${i}`] = batchRows[i].id;
      replacements[`size${i}`] = Number(batchRows[i].size) || 0;
      values.push(`('upload', :size${i}, :userId, :contentId${i}, NOW(), NOW())`);
    }
    await sequelize.query(
      `INSERT INTO "userContentActions" (name, size, "userId", "contentId", "createdAt", "updatedAt")
         VALUES ${values.join(', ')}`,
      {replacements},
    );
    created += batchRows.length;
    process.stdout.write(`\r  upload actions: ${created}/${missingRows.length}`);
  }
  process.stdout.write('\n');
}

async function updateFixtureGroupCounters(sequelize: Sequelize, groupId: number) {
  const [{count, maxLocalId}] = (await sequelize.query(
    `SELECT COUNT(*) FILTER (WHERE "isDeleted" = false AND "status" = 'published')::int AS count,
            COALESCE(MAX("localId"), 0)::int AS "maxLocalId"
       FROM posts
       WHERE "groupId" = :groupId`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as Array<{ count: number; maxLocalId: number }>;

  await sequelize.query(
    `UPDATE groups
       SET "publishedPostsCount" = :maxLocalId,
           "availablePostsCount" = :count,
           "size" = (
             SELECT COALESCE(SUM("size"), 0)
             FROM posts
             WHERE "groupId" = :groupId AND "isDeleted" = false AND "status" = 'published'
           )
       WHERE id = :groupId`,
    {replacements: {groupId, count, maxLocalId}},
  );

  return count;
}

async function main() {
  const sequelize = new Sequelize({...(config as any), logging: false});
  await sequelize.authenticate();

  const [{ id: userId } = { id: null as any }] = (await sequelize.query(
    `SELECT id FROM users WHERE name = :name LIMIT 1`,
    {replacements: {name: 'scalability-fixture-user'}, type: QueryTypes.SELECT},
  )) as Array<{ id: number }>;

  let actualUserId = userId;
  if (!actualUserId) {
    const [created] = (await sequelize.query(
      `INSERT INTO users (name, "manifestStaticStorageId", "createdAt", "updatedAt")
         VALUES (:name, :staticId, NOW(), NOW())
       RETURNING id`,
      {
        replacements: {name: 'scalability-fixture-user', staticId: `fixture-static-${Date.now()}`},
        type: QueryTypes.INSERT,
      },
    )) as any;
    actualUserId = (created[0] as any).id;
    console.log(`created fixture user id=${actualUserId}`);
  } else {
    console.log(`reusing fixture user id=${actualUserId}`);
  }

  const [existingGroup] = (await sequelize.query(
    `SELECT id FROM groups WHERE name = :name LIMIT 1`,
    {replacements: {name: GROUP_NAME}, type: QueryTypes.SELECT},
  )) as Array<{ id: number }>;

  let groupId: number;
  if (existingGroup && !RESET) {
    groupId = existingGroup.id;
    const [{ count }] = (await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM posts WHERE "groupId" = :groupId`,
      {replacements: {groupId}, type: QueryTypes.SELECT},
    )) as Array<{ count: number }>;
    if (count >= POST_COUNT) {
      console.log(`fixture group ${GROUP_NAME} already has ${count} posts (>= ${POST_COUNT}); checking side fixture rows`);
    } else {
      console.log(`fixture group exists with ${count} posts; topping up to ${POST_COUNT}`);
    }
  } else {
    if (existingGroup && RESET) {
      console.log(`FIXTURE_RESET=true: clearing existing fixture group ${GROUP_NAME} (id=${existingGroup.id})`);
      await sequelize.query(
        `DELETE FROM "postsContents" WHERE "postId" IN (SELECT id FROM posts WHERE "groupId" = :groupId)`,
        {replacements: {groupId: existingGroup.id}},
      );
      await sequelize.query(`DELETE FROM "categoryGroups" WHERE "groupId" = :groupId`, {replacements: {groupId: existingGroup.id}});
      await sequelize.query(`DELETE FROM posts WHERE "groupId" = :groupId`, {replacements: {groupId: existingGroup.id}});
      await sequelize.query(`DELETE FROM groups WHERE id = :id`, {replacements: {id: existingGroup.id}});
    }
    const [created] = (await sequelize.query(
      `INSERT INTO groups (name, "creatorId", "isPublic", "isRemote", "isDeleted", "publishedPostsCount", "availablePostsCount", "createdAt", "updatedAt")
         VALUES (:name, :creatorId, true, false, false, 0, 0, NOW(), NOW())
       RETURNING id`,
      {replacements: {name: GROUP_NAME, creatorId: actualUserId}, type: QueryTypes.INSERT},
    )) as any;
    groupId = (created[0] as any).id;
    console.log(`created fixture group id=${groupId}`);
  }

  await seedStaticIdState(sequelize, groupId);
  await seedFixtureCategory(sequelize, groupId);

  // Bulk-create CONTENT_COUNT contents owned by the fixture user.
  const [{ count: existingContents }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM contents WHERE "userId" = :userId AND name LIKE 'fx-content-%'`,
    {replacements: {userId: actualUserId}, type: QueryTypes.SELECT},
  )) as Array<{ count: number }>;

  if (existingContents < CONTENT_COUNT) {
    const need = CONTENT_COUNT - existingContents;
    console.log(`creating ${need} content rows`);
    let created = 0;
    while (created < need) {
      const batch = Math.min(BATCH, need - created);
      const values: string[] = [];
      const replacements: any = {userId: actualUserId};
      for (let i = 0; i < batch; i++) {
        const idx = existingContents + created + i;
        replacements[`name${i}`] = `fx-content-${idx}`;
        replacements[`storageId${i}`] = `fx-storage-${idx}`;
        replacements[`manifestStorageId${i}`] = `fx-content-manifest-${idx}`;
        replacements[`largePreviewStorageId${i}`] = `fx-large-preview-${idx}`;
        replacements[`mediumPreviewStorageId${i}`] = `fx-medium-preview-${idx}`;
        replacements[`smallPreviewStorageId${i}`] = `fx-small-preview-${idx}`;
        replacements[`size${i}`] = ((idx % 100) + 1) * 1024;
        values.push(
          `(:name${i}, 'image/jpeg', 'jpg', 'image', :storageId${i}, :largePreviewStorageId${i}, :mediumPreviewStorageId${i}, :smallPreviewStorageId${i}, 'image/jpeg', 'jpg', :manifestStorageId${i}, :size${i}, :userId, NOW(), NOW())`,
        );
      }
      await sequelize.query(
        `INSERT INTO contents (name, "mimeType", "extension", "view", "storageId", "largePreviewStorageId", "mediumPreviewStorageId", "smallPreviewStorageId", "previewMimeType", "previewExtension", "manifestStorageId", "size", "userId", "createdAt", "updatedAt")
           VALUES ${values.join(', ')}`,
        {replacements},
      );
      created += batch;
      process.stdout.write(`\r  contents: ${existingContents + created}/${CONTENT_COUNT}`);
    }
    process.stdout.write('\n');
  } else {
    console.log(`reusing ${existingContents} existing content rows`);
  }

  await normalizeFixturePreviewIds(sequelize, actualUserId);

  // Pull all fixture content ids for attachment.
  const contentRows = (await sequelize.query(
    `SELECT id, size FROM contents WHERE "userId" = :userId AND name LIKE 'fx-content-%' ORDER BY id`,
    {replacements: {userId: actualUserId}, type: QueryTypes.SELECT},
  )) as Array<{ id: number; size: string | number }>;
  const contentIds = contentRows.map((r) => r.id);
  console.log(`have ${contentIds.length} content ids available for attachment`);
  await seedUserContentActions(sequelize, actualUserId, contentRows);

  // Find existing fixture post count to top-up rather than duplicate.
  const [{ count: existingPosts }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM posts WHERE "groupId" = :groupId`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as Array<{ count: number }>;
  const need = POST_COUNT - existingPosts;
  if (need <= 0) {
    const actualCount = await updateFixtureGroupCounters(sequelize, groupId);
    console.log(`fixture group already has ${actualCount} published posts (>= ${POST_COUNT})`);
    await sequelize.close();
    return;
  }
  console.log(`inserting ${need} posts in batches of ${BATCH}`);

  // We track post ids returned per batch so we can attach contents in the same loop.
  let inserted = 0;
  while (inserted < need) {
    const batchSize = Math.min(BATCH, need - inserted);
    const values: string[] = [];
    const replacements: any = {groupId, userId: actualUserId};
    for (let i = 0; i < batchSize; i++) {
      const localId = existingPosts + inserted + i + 1;
      replacements[`status${i}`] = 'published';
      replacements[`name${i}`] = `fx-post-${localId}`;
      replacements[`localId${i}`] = localId;
      replacements[`size${i}`] = (localId % 200) * 256;
      replacements[`publishedAt${i}`] = nowMinus(need - inserted - i);
      replacements[`manifestStorageId${i}`] = `fx-post-manifest-${groupId}-${localId}`;
      values.push(
        `(:status${i}, :name${i}, :publishedAt${i}, 'post-text', :localId${i}, :size${i}, false, false, false, :manifestStorageId${i}, :groupId, :userId, NOW(), NOW())`,
      );
    }
    const result = (await sequelize.query(
      `INSERT INTO posts (status, name, "publishedAt", "view", "localId", "size", "isRemote", "isEncrypted", "isDeleted", "manifestStorageId", "groupId", "userId", "createdAt", "updatedAt")
         VALUES ${values.join(', ')}
       RETURNING id`,
      {replacements, type: QueryTypes.INSERT},
    )) as any;
    const insertedIds: number[] = (result[0] as Array<{ id: number }>).map((r) => r.id);

    // Attach contents to ATTACH_RATIO of the inserted posts.
    if (contentIds.length > 0) {
      const links: string[] = [];
      const linkReplacements: any = {};
      let linkIdx = 0;
      for (let i = 0; i < insertedIds.length; i++) {
        if (Math.random() >= ATTACH_RATIO) {
          continue;
        }
        const postId = insertedIds[i];
        const attachCount = 1 + (i % 3); // 1-3 attachments
        for (let k = 0; k < attachCount; k++) {
          const contentId = contentIds[(i * 7 + k) % contentIds.length];
          linkReplacements[`pId${linkIdx}`] = postId;
          linkReplacements[`cId${linkIdx}`] = contentId;
          linkReplacements[`pos${linkIdx}`] = k;
          links.push(`(:pId${linkIdx}, :cId${linkIdx}, :pos${linkIdx}, 'attachment', NOW(), NOW())`);
          linkIdx++;
        }
      }
      if (links.length > 0) {
        await sequelize.query(
          `INSERT INTO "postsContents" ("postId", "contentId", "position", "view", "createdAt", "updatedAt")
             VALUES ${links.join(', ')}`,
          {replacements: linkReplacements},
        );
      }
    }

    inserted += batchSize;
    process.stdout.write(`\r  posts: ${inserted + existingPosts}/${POST_COUNT}`);
  }
  process.stdout.write('\n');

  // Sync the published-counter on the fixture group so reads have realistic values.
  const actualCount = await updateFixtureGroupCounters(sequelize, groupId);

  console.log(`done. fixture group id=${groupId} has ${actualCount} published posts`);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
