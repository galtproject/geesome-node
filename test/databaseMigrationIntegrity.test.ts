import assert from 'node:assert';
import {getMigrationCoverageProblems, runMigrationIntegrityAudit} from '../check/databaseMigrationIntegrity.js';
import {IGeesomeApp} from '../app/interface.js';
import {CorePermissionName} from '../app/modules/database/interface.js';

describe("databaseMigrationIntegrity", function () {
  it("covers every recent migration file", function () {
    assert.deepEqual(getMigrationCoverageProblems(), []);
  });

  it("passes against a model-synced Postgres database", async function () {
    this.timeout(60000);
    const appConfig = (await import('../app/config.js')).default;
    appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
    let app: IGeesomeApp | null = null;

    try {
      app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7789});
      await app.flushDatabase();
      const admin = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'}).then((r) => r.user);
      const testUser = await app.registerUser({
        email: 'user@user.com',
        name: 'user',
        password: 'user',
        permissions: [CorePermissionName.UserAll]
      });

      const group = await app.ms.group.createGroup(testUser.id, {
        name: 'test',
        title: 'Test'
      });

      const queryInterface = app.ms.database.sequelize.getQueryInterface();
      const legacyComposition = await app.ms.database.models.Post.create({
        groupId: group.id,
        userId: testUser.id,
        // This is a pre-migration row fixture inserted below the canonical post
        // lifecycle. Keep it draft/zero-size so the migration audit does not
        // mistake the fixture for a published post whose counters were skipped.
        status: 'draft',
        size: 0,
        type: 'microwave-girls-image-composition',
        source: 'microwave-girls',
        sourceChannelId: 'image-composition-v1',
        sourcePostId: 'legacy-composition-identity',
      });
      const entityMigration = (await import('../app/modules/group/migrations/20260720000000-add-image-composition-post-index.cjs')).default;
      await entityMigration.up(queryInterface);
      await legacyComposition.reload();
      assert.equal(legacyComposition.type, 'image-composition');
      assert.equal(legacyComposition.entityId, 'legacy-composition-identity');
      assert.equal(legacyComposition.source, null);
      assert.equal(legacyComposition.sourceChannelId, null);
      assert.equal(legacyComposition.sourcePostId, null);

      const postIndexes = await queryInterface.showIndex('posts');
      const entityIndex = postIndexes.find(index => index.name === 'posts_group_type_entity_unique');
      assert(entityIndex, 'native post entity identity index is missing after migration');
      assert.equal(entityIndex.unique, true);
      assert.deepEqual(entityIndex.fields.map(field => field.attribute), ['groupId', 'type', 'entityId']);
      await assert.rejects(app.ms.database.models.Post.create({
        groupId: group.id,
        userId: testUser.id,
        status: 'draft',
        size: 0,
        type: 'image-composition',
        entityId: 'legacy-composition-identity',
      }), (error: any) => error?.name === 'SequelizeUniqueConstraintError');

      const pinStorageObjectColumns = await queryInterface.describeTable('pinStorageObjects');
      for (const column of [
        'attemptId',
        'attemptCount',
        'requestedAt',
        'acceptedAt',
        'confirmedAt',
        'failedAt',
        'lastAttemptAt',
        'nextCheckAt',
        'lastErrorCode',
        'lastErrorMessage',
        'reconcileClaimId',
        'reconcileClaimExpiresAt',
        'reconcileAttemptCount',
        'lastReconcileAt'
      ]) {
        assert(pinStorageObjectColumns[column], `pinStorageObjects.${column} is missing after model sync`);
      }
      const pinStorageObjectIndexes = await queryInterface.showIndex('pinStorageObjects');
      assert(
        pinStorageObjectIndexes.some(index => index.name === 'pin_storage_objects_status_check_idx'),
        'pinStorageObjects reconciliation scan index is missing after model sync'
      );
      assert(
        pinStorageObjectIndexes.some(index => index.name === 'pin_storage_objects_reconcile_claim_idx'),
        'pinStorageObjects reconciliation claim index is missing after model sync'
      );

      const results = await runMigrationIntegrityAudit({requireMigrationMeta: false});
      const failures = results.filter((result) => result.status === 'fail');

      assert.deepEqual(failures, []);
    } finally {
      if (app) {
        await app.stop();
      }
    }
  });
});
