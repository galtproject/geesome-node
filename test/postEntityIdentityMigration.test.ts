import assert from 'node:assert';

describe('native post entity identity migration', function () {
  it('adds the generic identity column and creates both indexes', async function () {
    const migration = (await import('../app/modules/group/migrations/20260720000000-add-image-composition-post-index.cjs')).default;
    const queries: string[] = [];
    const queryInterface: any = {sequelize: {query: async (sql: string) => queries.push(sql)}};

    await migration.up(queryInterface);

    assert.equal(migration.useTransaction, false);
    assert.equal(queries.length, 3);
    assert.match(queries[0], /ADD COLUMN IF NOT EXISTS "entityId" VARCHAR\(200\)/);
    assert.match(queries[1], /CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_group_type_timeline_idx/);
    assert.match(queries[2], /CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS posts_group_type_entity_unique/);
    assert.match(queries[2], /ON posts \("groupId", "type", "entityId"\)/);
    assert.match(queries[2], /WHERE "entityId" IS NOT NULL/);
    assert.equal(queries.some(sql => /UPDATE posts/.test(sql)), false);
  });

  it('drops only the migration-owned schema', async function () {
    const migration = (await import('../app/modules/group/migrations/20260720000000-add-image-composition-post-index.cjs')).default;
    const queries: string[] = [];
    const queryInterface: any = {sequelize: {query: async (sql: string) => queries.push(sql)}};

    await migration.down(queryInterface);

    assert.equal(queries.length, 3);
    assert.match(queries[0], /DROP INDEX CONCURRENTLY IF EXISTS posts_group_type_entity_unique/);
    assert.match(queries[1], /DROP INDEX CONCURRENTLY IF EXISTS posts_group_type_timeline_idx/);
    assert.match(queries[2], /DROP COLUMN IF EXISTS "entityId"/);
    assert.equal(queries.some(sql => /UPDATE posts/.test(sql)), false);
  });
});
