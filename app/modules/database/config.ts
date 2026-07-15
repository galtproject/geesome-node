/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import debug from 'debug';
const sqlLog = debug('geesome:database:sql');

export default {
  'dialect': 'postgres',
  'database': process.env.DATABASE_NAME || 'geesome_node',
  'username': process.env.DATABASE_USER || 'geesome',
  'password': process.env.DATABASE_PASSWORD || 'geesome',
  'host': process.env.DATABASE_HOST || 'localhost',
  'port': parseInt(process.env.DATABASE_PORT || '5432'),
  'dialectOptions': {
    application_name: process.env.DATABASE_APPLICATION_NAME || 'geesome-node'
  },
  // P3 fix from the scalability review: Sequelize defaults to a 5-connection pool, which throttles
  // any node serving more than a handful of concurrent API calls (every authenticated request fans
  // out to permission, group, and post queries in parallel). The defaults below are conservative
  // for a single-process node and overridable via env so deployers can tune to their hardware.
  'pool': {
    max: parseInt(process.env.DATABASE_POOL_MAX || '20'),
    min: parseInt(process.env.DATABASE_POOL_MIN || '0'),
    acquire: parseInt(process.env.DATABASE_POOL_ACQUIRE_MS || '30000'),
    idle: parseInt(process.env.DATABASE_POOL_IDLE_MS || '30000'),
  },
  'logging': isSqlLoggingEnabled() ? logSqlQuery : false,
  // 'dialect': 'sqlite',
  // 'storage': `${process.env.DATA_DIR || 'data'}/core.sqlite`
};

function isSqlLoggingEnabled() {
  return process.env.GEESOME_LOG_SQL === '1';
}

function logSqlQuery(query) {
  if (isNoisySqlQuery(query)) {
    return;
  }

  sqlLog(query);
}

function isNoisySqlQuery(query) {
  return [
    'SELECT "post"."id", "post"."status", "post"."name", "post"."publishedAt"',
    'SELECT "group"."id", "group"."name", "group"."title", "group"."description"',
    'SELECT "user"."id", "user"."name", "user"."email", "user"."keyStoreMethod"',
  ].some((fragment) => query.includes(fragment));
}
