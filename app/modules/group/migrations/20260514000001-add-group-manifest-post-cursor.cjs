'use strict';

/**
 * Database scalability review: durable group manifest post cursor.
 *
 * Compatibility group manifests still mutate the previous inline post trie.
 * These nullable fields store the last successfully processed Post
 * (updatedAt, id) cursor so the next regeneration can use the same
 * deterministic tie-breaker as the batched ref scan instead of only the
 * previous manifest timestamp.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE groups
        ADD COLUMN IF NOT EXISTS "manifestPostsCursorUpdatedAt" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "manifestPostsCursorId" INTEGER
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE groups
        DROP COLUMN IF EXISTS "manifestPostsCursorId",
        DROP COLUMN IF EXISTS "manifestPostsCursorUpdatedAt"
    `);
  },
};
