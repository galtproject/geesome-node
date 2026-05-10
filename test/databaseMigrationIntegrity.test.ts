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
      await (app.ms.database as any).sequelize.query('TRUNCATE "userAsyncOperations", "groupReads" CASCADE');
      const admin = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'}).then((r) => r.user);
      const testUser = await app.registerUser({
        email: 'user@user.com',
        name: 'user',
        password: 'user',
        permissions: [CorePermissionName.UserAll]
      });

      await app.ms.group.createGroup(testUser.id, {
        name: 'test',
        title: 'Test'
      });

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
