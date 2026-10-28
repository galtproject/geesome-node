'use strict';
const table = 'payments_crypto_hd_accounts';
const resourceIndex = 'payments_hd_accounts_resource_unique';
async function exists(qi) {
  const [rows] = await qi.sequelize.query(`SELECT to_regclass('${table}') AS name`);
  return Boolean(rows[0].name);
}
module.exports = {
  up: async qi => {
    if (!(await exists(qi))) {
      return;
    }
    await qi.sequelize.transaction(async transaction => {
      await qi.sequelize.query('SELECT pg_advisory_xact_lock(731904201)', {transaction});
      await qi.sequelize.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "resourceId" varchar(30)`, {transaction});
      // Preserve keys only when all historical invoice evidence agrees. Shared
      // or unused allocations remain NULL: reserved forever, never reallocated.
      await qi.sequelize.query(`UPDATE ${table} AS account SET "resourceId" = source.resource
        FROM (SELECT a.id, MIN(i."resourceId") AS resource
          FROM ${table} a JOIN payments_crypto_invoices i ON i."addressId" = a."addressId"
          GROUP BY a.id HAVING COUNT(DISTINCT i."resourceId") = 1
            AND bool_and(i."readerId" = a."readerId")) source
        WHERE account.id = source.id AND account."resourceId" IS NULL`, {transaction});
      const indexes = await qi.showIndex(table, {transaction});
      for (const index of indexes) {
        const fields = index.fields.map(field => field.attribute);
        if (index.unique && fields.length === 2 && fields.includes('walletFingerprint') && fields.includes('readerId')) {
          await qi.removeIndex(table, index.name, {transaction});
        }
      }
      await qi.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${resourceIndex}
        ON ${table} ("walletFingerprint", "readerId", "resourceId")`, {transaction});
    });
  },
  down: async qi => {
    if (!(await exists(qi))) {
      return;
    }
    await qi.sequelize.transaction(async transaction => {
      await qi.sequelize.query('SELECT pg_advisory_xact_lock(731904201)', {transaction});
      const [duplicates] = await qi.sequelize.query(`SELECT 1 FROM ${table}
        GROUP BY "walletFingerprint", "readerId" HAVING count(*) > 1 LIMIT 1`, {transaction});
      if (duplicates.length) {
        throw Error('payment_resource_addresses_rollback_requires_reconciliation');
      }
      await qi.sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS payments_hd_accounts_reader_unique
        ON ${table} ("walletFingerprint", "readerId")`, {transaction});
      await qi.removeIndex(table, resourceIndex, {transaction});
      await qi.removeColumn(table, 'resourceId', {transaction});
    });
  }
};
