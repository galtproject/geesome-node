'use strict';

/**
 * Database scalability review: A1 content identity cleanup.
 *
 * Content remains a user-owned library row, so different users may keep
 * separate metadata rows for the same physical storageId. A single user
 * should have at most one row per storageId; otherwise concurrent uploads
 * can create ambiguous attachment/quota rows.
 *
 * This migration merges existing same-user duplicates onto the oldest row,
 * rewrites known content references, deletes duplicate rows, then adds a
 * partial unique index for owned rows. Optional module tables are checked at
 * runtime because the database migration set can run before every feature
 * module has created its tables on a fresh node.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      CREATE TEMP TABLE content_user_storage_dedup AS
      WITH ranked AS (
        SELECT
          id,
          MIN(id) OVER (PARTITION BY "userId", "storageId") AS keep_id,
          ROW_NUMBER() OVER (PARTITION BY "userId", "storageId" ORDER BY id ASC) AS row_num
        FROM contents
        WHERE "userId" IS NOT NULL
          AND "storageId" IS NOT NULL
      )
      SELECT id, keep_id
      FROM ranked
      WHERE row_num > 1;

      DO $$
      BEGIN
        IF to_regclass('"postsContents"') IS NOT NULL THEN
          EXECUTE 'UPDATE "postsContents" ref
            SET "contentId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."contentId" = dedup.id';
        END IF;

        IF to_regclass('"fileCatalogItems"') IS NOT NULL THEN
          EXECUTE 'UPDATE "fileCatalogItems" ref
            SET "contentId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."contentId" = dedup.id';
        END IF;

        IF to_regclass('"userContentActions"') IS NOT NULL THEN
          EXECUTE 'UPDATE "userContentActions" ref
            SET "contentId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."contentId" = dedup.id';
        END IF;

        IF to_regclass('"userAsyncOperations"') IS NOT NULL THEN
          EXECUTE 'UPDATE "userAsyncOperations" ref
            SET "contentId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."contentId" = dedup.id';
        END IF;

        IF to_regclass('"descriptions"') IS NOT NULL THEN
          EXECUTE 'UPDATE descriptions ref
            SET "contentId" = dedup.keep_id::text
            FROM content_user_storage_dedup dedup
            WHERE ref."contentId" = dedup.id::text';
        END IF;

        IF to_regclass('"socNetImport_contentMessages"') IS NOT NULL THEN
          EXECUTE 'DELETE FROM "socNetImport_contentMessages" duplicate
            USING content_user_storage_dedup dedup, "socNetImport_contentMessages" keeper
            WHERE duplicate."dbContentId" = dedup.id
              AND keeper."dbContentId" = dedup.keep_id
              AND keeper."userId" IS NOT DISTINCT FROM duplicate."userId"
              AND keeper."dbChannelId" IS NOT DISTINCT FROM duplicate."dbChannelId"
              AND keeper."msgId" IS NOT DISTINCT FROM duplicate."msgId"';
          EXECUTE 'UPDATE "socNetImport_contentMessages" ref
            SET "dbContentId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."dbContentId" = dedup.id';
        END IF;

        IF to_regclass('"groups"') IS NOT NULL THEN
          EXECUTE 'UPDATE groups ref
            SET "avatarImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."avatarImageId" = dedup.id';
          EXECUTE 'UPDATE groups ref
            SET "coverImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."coverImageId" = dedup.id';
        END IF;

        IF to_regclass('"users"') IS NOT NULL THEN
          EXECUTE 'UPDATE users ref
            SET "avatarImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."avatarImageId" = dedup.id';
        END IF;

        IF to_regclass('"categories"') IS NOT NULL THEN
          EXECUTE 'UPDATE categories ref
            SET "avatarImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."avatarImageId" = dedup.id';
          EXECUTE 'UPDATE categories ref
            SET "coverImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."coverImageId" = dedup.id';
        END IF;

        IF to_regclass('"tags"') IS NOT NULL THEN
          EXECUTE 'UPDATE tags ref
            SET "avatarImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."avatarImageId" = dedup.id';
          EXECUTE 'UPDATE tags ref
            SET "coverImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."coverImageId" = dedup.id';
        END IF;

        IF to_regclass('"mentions"') IS NOT NULL THEN
          EXECUTE 'UPDATE mentions ref
            SET "avatarImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."avatarImageId" = dedup.id';
          EXECUTE 'UPDATE mentions ref
            SET "coverImageId" = dedup.keep_id
            FROM content_user_storage_dedup dedup
            WHERE ref."coverImageId" = dedup.id';
        END IF;
      END $$;

      DELETE FROM contents duplicate
      USING content_user_storage_dedup dedup
      WHERE duplicate.id = dedup.id;

      DROP TABLE content_user_storage_dedup;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS contents_user_storage_unique
        ON contents ("userId", "storageId")
        WHERE "userId" IS NOT NULL
          AND "storageId" IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      DROP INDEX CONCURRENTLY IF EXISTS contents_user_storage_unique
    `);
  },
};
