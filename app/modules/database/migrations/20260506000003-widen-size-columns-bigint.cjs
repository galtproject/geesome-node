'use strict';

/**
 * Database scalability review: Slice 14 — widen integer size columns to BIGINT.
 *
 * Closes the P2 finding "Size columns and size semantics can overflow or
 * mislead". Content.size and fileCatalogItems.size were already BIGINT
 * (legacy 20250616015644-change-size-type.cjs), but post.size, group.size,
 * userContentActions.size, and the contents preview size columns
 * (largePreviewSize / mediumPreviewSize / smallPreviewSize) were still
 * INTEGER. A group with 100k+ media posts can exceed the 32-bit signed
 * range (~2.1 GB worth of attached bytes if measured in bytes per post),
 * and the per-user content-action ledger can hit the same ceiling under
 * sustained imports.
 *
 * Postgres-only target. ALTER COLUMN ... TYPE bigint takes a brief
 * ACCESS EXCLUSIVE lock and rewrites the table on disk; expected wall
 * time scales with row count. For the largest tables (posts, contents)
 * pre-coordinate this migration with a maintenance window. Errors
 * propagate so deploy tooling fails loudly (no .catch swallowing).
 *
 * The down migration narrows back to INTEGER. Note: data that has
 * already exceeded INT_MAX would be lost on rollback — operators
 * should snapshot before rolling back.
 */

const UPS = [
  `ALTER TABLE posts ALTER COLUMN "size" TYPE bigint`,
  `ALTER TABLE groups ALTER COLUMN "size" TYPE bigint`,
  `ALTER TABLE "userContentActions" ALTER COLUMN "size" TYPE bigint`,
  `ALTER TABLE contents ALTER COLUMN "largePreviewSize" TYPE bigint`,
  `ALTER TABLE contents ALTER COLUMN "mediumPreviewSize" TYPE bigint`,
  `ALTER TABLE contents ALTER COLUMN "smallPreviewSize" TYPE bigint`,
];

const DOWNS = [
  `ALTER TABLE contents ALTER COLUMN "smallPreviewSize" TYPE integer USING "smallPreviewSize"::integer`,
  `ALTER TABLE contents ALTER COLUMN "mediumPreviewSize" TYPE integer USING "mediumPreviewSize"::integer`,
  `ALTER TABLE contents ALTER COLUMN "largePreviewSize" TYPE integer USING "largePreviewSize"::integer`,
  `ALTER TABLE "userContentActions" ALTER COLUMN "size" TYPE integer USING "size"::integer`,
  `ALTER TABLE groups ALTER COLUMN "size" TYPE integer USING "size"::integer`,
  `ALTER TABLE posts ALTER COLUMN "size" TYPE integer USING "size"::integer`,
];

module.exports = {
  up: async (queryInterface) => {
    for (const sql of UPS) {
      await queryInterface.sequelize.query(sql);
    }
  },

  down: async (queryInterface) => {
    for (const sql of DOWNS) {
      await queryInterface.sequelize.query(sql);
    }
  },
};
