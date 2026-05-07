'use strict';

/**
 * Database scalability review: Slice 19 — operation, scheduler, pin, static
 * rebind, and category-feed indexes.
 *
 * These are additive Postgres indexes for hot lookup paths that were left after
 * the first timeline/content batches:
 * - async-operation user lists and startup inProcess sweep;
 * - auto-action executor due/active range scan;
 * - pin-account lookups by owner + name;
 * - disabled static-rebind cron's group scan before it can be re-enabled;
 * - category feed/admin/member pivots used by category pages and permissions;
 * - user-limit lookup by (userId, name).
 *
 * CREATE INDEX CONCURRENTLY must run outside a transaction. Errors propagate so
 * deploy tooling fails loudly instead of silently skipping rollout safety.
 */

const STATEMENTS = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_async_operations_user_process_name_created_idx
     ON "userAsyncOperations" ("userId", "inProcess", "name", "createdAt")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_async_operations_process_updated_idx
     ON "userAsyncOperations" ("inProcess", "updatedAt")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS auto_actions_active_execute_idx
     ON "autoActions" ("isActive", "executeOn")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS pin_accounts_user_name_idx
     ON "pinAccounts" ("userId", "name")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS pin_accounts_group_name_idx
     ON "pinAccounts" ("groupId", "name")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS groups_static_rebind_idx
     ON "groups" ("isDeleted", "staticStorageUpdatedAt")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_limits_user_name_idx
     ON "userLimits" ("userId", "name")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_admins_user_category_idx
     ON "categoryAdministrators" ("userId", "categoryId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_admins_category_user_idx
     ON "categoryAdministrators" ("categoryId", "userId")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_members_user_category_idx
     ON "categoryMembers" ("userId", "categoryId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_members_category_user_idx
     ON "categoryMembers" ("categoryId", "userId")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_groups_category_group_idx
     ON "categoryGroups" ("categoryId", "groupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_groups_group_category_idx
     ON "categoryGroups" ("groupId", "categoryId")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_group_membership_category_group_idx
     ON "categoryGroupsMemberships" ("categoryId", "groupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS category_group_membership_group_category_idx
     ON "categoryGroupsMemberships" ("groupId", "categoryId")`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_sections_pivot_section_group_idx
     ON "groupSectionsPivots" ("sectionId", "groupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_sections_pivot_group_idx
     ON "groupSectionsPivots" ("groupId")`,
];

const DROP_STATEMENTS = [
  `DROP INDEX CONCURRENTLY IF EXISTS group_sections_pivot_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS group_sections_pivot_section_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_group_membership_group_category_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_group_membership_category_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_groups_group_category_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_groups_category_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_members_category_user_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_members_user_category_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_admins_category_user_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS category_admins_user_category_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS user_limits_user_name_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS groups_static_rebind_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS pin_accounts_group_name_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS pin_accounts_user_name_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS auto_actions_active_execute_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS user_async_operations_process_updated_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS user_async_operations_user_process_name_created_idx`,
];

module.exports = {
  useTransaction: false,

  up: async (queryInterface) => {
    for (const sql of STATEMENTS) {
      await queryInterface.sequelize.query(sql);
    }
  },

  down: async (queryInterface) => {
    for (const sql of DROP_STATEMENTS) {
      await queryInterface.sequelize.query(sql);
    }
  },
};
