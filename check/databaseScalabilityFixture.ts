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
 * - 1k content rows
 * - 100k posts in the fixture group, ~30% with attached content
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
const RESET = (process.env.FIXTURE_RESET || '').toLowerCase() === 'true';
const BATCH = 5000;

function nowMinus(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
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
      console.log(`fixture group ${GROUP_NAME} already has ${count} posts (>= ${POST_COUNT}); nothing to do. Use FIXTURE_RESET=true to rebuild.`);
      await sequelize.close();
      return;
    }
    console.log(`fixture group exists with ${count} posts; topping up to ${POST_COUNT}`);
  } else {
    if (existingGroup && RESET) {
      console.log(`FIXTURE_RESET=true: clearing existing fixture group ${GROUP_NAME} (id=${existingGroup.id})`);
      await sequelize.query(
        `DELETE FROM "postsContents" WHERE "postId" IN (SELECT id FROM posts WHERE "groupId" = :groupId)`,
        {replacements: {groupId: existingGroup.id}},
      );
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
        replacements[`size${i}`] = ((idx % 100) + 1) * 1024;
        values.push(
          `(:name${i}, 'image/jpeg', 'jpg', 'image', :storageId${i}, :manifestStorageId${i}, :size${i}, :userId, NOW(), NOW())`,
        );
      }
      await sequelize.query(
        `INSERT INTO contents (name, "mimeType", "extension", "view", "storageId", "manifestStorageId", "size", "userId", "createdAt", "updatedAt")
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

  // Pull all fixture content ids for attachment.
  const contentRows = (await sequelize.query(
    `SELECT id FROM contents WHERE "userId" = :userId AND name LIKE 'fx-content-%' ORDER BY id`,
    {replacements: {userId: actualUserId}, type: QueryTypes.SELECT},
  )) as Array<{ id: number }>;
  const contentIds = contentRows.map((r) => r.id);
  console.log(`have ${contentIds.length} content ids available for attachment`);

  // Find existing fixture post count to top-up rather than duplicate.
  const [{ count: existingPosts }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM posts WHERE "groupId" = :groupId`,
    {replacements: {groupId}, type: QueryTypes.SELECT},
  )) as Array<{ count: number }>;
  const need = POST_COUNT - existingPosts;
  if (need <= 0) {
    console.log(`fixture group already has ${existingPosts} posts (>= ${POST_COUNT})`);
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
  await sequelize.query(
    `UPDATE groups SET "publishedPostsCount" = :count, "availablePostsCount" = :count, "size" = (
        SELECT COALESCE(SUM("size"), 0) FROM posts WHERE "groupId" = :groupId
     ) WHERE id = :groupId`,
    {replacements: {groupId, count: POST_COUNT}},
  );

  console.log(`done. fixture group id=${groupId} has ${POST_COUNT} posts`);
  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
