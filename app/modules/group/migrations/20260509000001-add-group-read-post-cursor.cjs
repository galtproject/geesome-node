'use strict';

/**
 * Database scalability review: unread cursor tie-breaker.
 *
 * GroupRead historically stored only readAt. Timeline ordering is
 * (publishedAt DESC, id DESC), so timestamp-only unread counts can hide
 * newer same-timestamp posts. This nullable column lets clients store the
 * post id that belongs to readAt while preserving old readAt-only rows.
 */

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "groupReads"
      ADD COLUMN IF NOT EXISTS "readPostId" INTEGER
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE "groupReads"
      DROP COLUMN IF EXISTS "readPostId"
    `);
  },
};
