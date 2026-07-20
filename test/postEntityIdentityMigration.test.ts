import assert from 'node:assert';

describe('native post entity identity migration', function () {
  it('adds the column, backfills legacy compositions, then creates both indexes', async function () {
    const migration = (await import('../app/modules/group/migrations/20260720000000-add-image-composition-post-index.cjs')).default;
    const queries: string[] = [];
    const queryInterface: any = {sequelize: {query: async (sql: string) => queries.push(sql)}};

    await migration.up(queryInterface);

    assert.equal(migration.useTransaction, false);
    assert.equal(queries.length, 4);
    assert.match(queries[0], /ADD COLUMN IF NOT EXISTS "entityId" VARCHAR\(200\)/);
    assert.match(queries[1], /type = 'image-composition'/);
    assert.match(queries[1], /"entityId" = "sourcePostId"/);
    assert.match(queries[1], /source = NULL/);
    assert.match(queries[1], /type = 'microwave-girls-image-composition'/);
    assert.match(queries[1], /source = 'microwave-girls'/);
    assert.match(queries[1], /"sourceChannelId" = 'image-composition-v1'/);
    assert.match(queries[2], /CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_group_type_timeline_idx/);
    assert.match(queries[3], /CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS posts_group_type_entity_unique/);
    assert.match(queries[3], /ON posts \("groupId", "type", "entityId"\)/);
    assert.match(queries[3], /WHERE "entityId" IS NOT NULL/);
  });

  it('drops migration-owned schema without inventing remote provenance', async function () {
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
