'use strict';

/**
 * Database scalability review: Slice 9 — group permission and membership indexes.
 *
 * Permission and membership checks (isAdminInGroupPure, isMemberInGroupPure,
 * isHaveGroupPermission, getGroupPermissions, addMemberToGroupPure,
 * addAdminToGroupPure) run on every authenticated group API call. The
 * underlying through-tables and groupPermission have empty model
 * options today, so these checks fall back to scans on large
 * memberships/admin sets. The review flags this as a P2 finding.
 *
 * Postgres-only target. Same CONCURRENTLY policy as
 * 20260506000000-add-post-timeline-indexes.cjs and
 * 20260506000001-add-content-and-quota-indexes.cjs.
 */

const STATEMENTS = [
  // groupPermission: per-user permission check, plus admin lookup by group.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_permissions_user_group_name_idx
     ON "groupPermissions" ("userId", "groupId", "name")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_permissions_group_user_idx
     ON "groupPermissions" ("groupId", "userId")`,

  // groupMembers through table.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_members_user_group_idx
     ON "groupMembers" ("userId", "groupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_members_group_user_idx
     ON "groupMembers" ("groupId", "userId")`,

  // groupAdministrators through table.
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_admins_user_group_idx
     ON "groupAdministrators" ("userId", "groupId")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS group_admins_group_user_idx
     ON "groupAdministrators" ("groupId", "userId")`,
];

const DROP_STATEMENTS = [
  `DROP INDEX CONCURRENTLY IF EXISTS group_admins_group_user_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS group_admins_user_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS group_members_group_user_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS group_members_user_group_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS group_permissions_group_user_idx`,
  `DROP INDEX CONCURRENTLY IF EXISTS group_permissions_user_group_name_idx`,
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
