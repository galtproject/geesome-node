/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import debug from 'debug';
const log = debug('geesome:database');

export default {
  'dialect': 'postgres',
  'database': process.env.DATABASE_NAME || 'geesome_node',
  'username': process.env.DATABASE_USER || 'geesome',
  'password': process.env.DATABASE_PASSWORD || 'geesome',
  'host': process.env.DATABASE_HOST || 'localhost',
  'port': parseInt(process.env.DATABASE_PORT || '5432'),
  'logging': (d) => {
    if (
        d.includes('SELECT "post"."id", "post"."status", "post"."name", "post"."publishedAt"') ||
        d.includes('SELECT "group"."id", "group"."name", "group"."title", "group"."description"') ||
        d.includes('SELECT "user"."id", "user"."name", "user"."email", "user"."keyStoreMethod"')
    ) {
      return;
    }
    log(d)
  },
  // 'dialect': 'sqlite',
  // 'storage': `${process.env.DATA_DIR || 'data'}/core.sqlite`
};
