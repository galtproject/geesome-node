'use strict';

/**
 * Database scalability review: widen the remaining aggregate size columns to
 * BIGINT.
 *
 * The hot post/group/content/quota size fields were widened in
 * 20260506000003-widen-size-columns-bigint.cjs. Category and section size
 * fields are quieter today, but they are still aggregate byte-like counters
 * and should not retain a 32-bit ceiling while the rest of the schema has
 * moved to bigint.
 *
 * Postgres-only target. ALTER COLUMN ... TYPE bigint takes an ACCESS EXCLUSIVE
 * lock on each table; categories and groupSections are expected to be much
 * smaller than posts/contents, but operators should still run this as part of
 * the backed-up May 2026 migration rehearsal.
 */

const UPS = [
  `ALTER TABLE categories ALTER COLUMN "size" TYPE bigint`,
  `ALTER TABLE "groupSections" ALTER COLUMN "size" TYPE bigint`,
];

const DOWNS = [
  `ALTER TABLE "groupSections" ALTER COLUMN "size" TYPE integer USING "size"::integer`,
  `ALTER TABLE categories ALTER COLUMN "size" TYPE integer USING "size"::integer`,
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
