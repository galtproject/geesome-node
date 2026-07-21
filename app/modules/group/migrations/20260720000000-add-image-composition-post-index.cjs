'use strict';

/**
 * Adds generic native post identity plus the typed timeline used by image
 * compositions. Native identities deliberately do not reuse remote-source
 * provenance fields. CONCURRENTLY requires no transaction.
 */
const TIMELINE_INDEX_NAME = 'posts_group_type_timeline_idx';
const ENTITY_INDEX_NAME = 'posts_group_type_entity_unique';

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TABLE posts
         ADD COLUMN IF NOT EXISTS "entityId" VARCHAR(200)`
    );

    await queryInterface.sequelize.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TIMELINE_INDEX_NAME}
         ON posts ("groupId", "type", "isDeleted", "status", "publishedAt", "id")`
    );

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${ENTITY_INDEX_NAME}
        ON posts ("groupId", "type", "entityId")
        WHERE "entityId" IS NOT NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS ${ENTITY_INDEX_NAME}`
    );
    await queryInterface.sequelize.query(
      `DROP INDEX CONCURRENTLY IF EXISTS ${TIMELINE_INDEX_NAME}`
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE posts DROP COLUMN IF EXISTS "entityId"'
    );
  },
};
