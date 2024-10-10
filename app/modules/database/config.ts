/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
const log = require('debug')('geesome:database');

module.exports = {
  'name': process.env.DATABASE_PASSWORD || 'geesome_node',
  'user': process.env.DATABASE_USER || 'geesome',
  'password': process.env.DATABASE_DB || 'geesome',
  'options': {
    'logging': (d) => {/*log(d)*/},
    'host': process.env.DATABASE_HOST || 'localhost',
    'dialect': 'postgres',
    // 'dialect': 'sqlite',
    // 'storage': `${process.env.DATA_DIR || 'data'}/core.sqlite`
  }
};
